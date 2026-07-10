# Phase 16 gate: verify migration, seeded coverage, idempotency, and DB-backed APIs.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MysqlContainer = "xlb-mysql-local"

function Invoke-LocalScript([string]$Path) {
  & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Root $Path)
  if ($LASTEXITCODE -ne 0) {
    throw "$Path failed with exit code $LASTEXITCODE"
  }
}

function Invoke-Scalar([string]$Sql) {
  $raw = & docker exec -e MYSQL_PWD=xlb_local_password $MysqlContainer mysql -uxlb --default-character-set=utf8mb4 -N -B xlb_local -e $Sql
  if ($LASTEXITCODE -ne 0) {
    throw "MySQL verification query failed: $Sql"
  }
  return (($raw | Out-String).Trim())
}

function Assert-Equal([string]$Label, [string]$Expected, [string]$Actual) {
  if ($Actual -ne $Expected) {
    throw "$Label expected $Expected but found $Actual"
  }
  Write-Host "PASS $Label = $Actual"
}

function Assert-Positive([string]$Label, [string]$Actual) {
  $value = 0
  if (-not [int]::TryParse($Actual, [ref]$value) -or $value -le 0) {
    throw "$Label expected a positive integer but found $Actual"
  }
  Write-Host "PASS $Label = $value"
}

$health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $MysqlContainer 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $health -ne "healthy") {
  throw "$MysqlContainer must be running and healthy; current status: $health"
}

Push-Location $Root
try {
  Invoke-LocalScript "scripts\migrate-local.ps1"
  Invoke-LocalScript "scripts\seed-local.ps1"
  Invoke-LocalScript "scripts\migrate-local.ps1"

  Assert-Equal "migration 033 applied once" "1" (Invoke-Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='033_phase16_sku_pricing_standards'")
  Assert-Equal "Phase 16 table count" "4" (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('service_sku_profiles','service_standards','price_fee_items','order_price_snapshots')")
  Assert-Positive "enabled SKU count" (Invoke-Scalar "SELECT COUNT(*) FROM service_skus WHERE is_enabled=1")
  Assert-Equal "enabled SKUs missing profile" "0" (Invoke-Scalar "SELECT COUNT(*) FROM service_skus s LEFT JOIN service_sku_profiles p ON p.sku_id=s.sku_id AND p.city_code=s.city_code WHERE s.is_enabled=1 AND p.sku_id IS NULL")
  Assert-Equal "enabled SKUs with fewer than three standards" "0" (Invoke-Scalar "SELECT COUNT(*) FROM (SELECT s.sku_id,s.city_code FROM service_skus s LEFT JOIN service_standards st ON st.sku_id=s.sku_id AND st.city_code=s.city_code AND st.is_enabled=1 WHERE s.is_enabled=1 GROUP BY s.sku_id,s.city_code HAVING COUNT(st.standard_id)<3) coverage_gap")
  Assert-Positive "enabled price rule count" (Invoke-Scalar "SELECT COUNT(*) FROM price_rules WHERE is_enabled=1")
  Assert-Equal "enabled price rules missing base fee" "0" (Invoke-Scalar "SELECT COUNT(*) FROM price_rules pr WHERE pr.is_enabled=1 AND NOT EXISTS (SELECT 1 FROM price_fee_items fi WHERE fi.price_rule_id=pr.price_rule_id AND fi.city_code=pr.city_code AND fi.fee_code='base_service_fee' AND fi.is_enabled=1)")
  Assert-Equal "enabled price rules without fee items" "0" (Invoke-Scalar "SELECT COUNT(*) FROM price_rules pr WHERE pr.is_enabled=1 AND NOT EXISTS (SELECT 1 FROM price_fee_items fi WHERE fi.price_rule_id=pr.price_rule_id AND fi.city_code=pr.city_code AND fi.is_enabled=1)")
  Assert-Equal "Phase 16 global city rows" "0" (Invoke-Scalar "SELECT (SELECT COUNT(*) FROM service_sku_profiles WHERE city_code='__global__')+(SELECT COUNT(*) FROM service_standards WHERE city_code='__global__')+(SELECT COUNT(*) FROM price_fee_items WHERE city_code='__global__')+(SELECT COUNT(*) FROM order_price_snapshots WHERE city_code='__global__')")

  & npx.cmd vitest run tests/contract/catalog.contract.test.ts tests/contract/pricing.contract.test.ts tests/unit/pricing.test.ts tests/integration/migrationRunner.test.ts tests/integration/pricingApi.test.ts tests/integration/orderCreate.test.ts
  if ($LASTEXITCODE -ne 0) {
    throw "Phase 16 contract/unit/integration verification failed"
  }

  Assert-Positive "order price snapshot count" (Invoke-Scalar "SELECT COUNT(*) FROM order_price_snapshots")
  Assert-Equal "invalid Phase 16 order snapshots" "0" (Invoke-Scalar "SELECT COUNT(*) FROM order_price_snapshots WHERE JSON_EXTRACT(quote_snapshot,'$.priceRuleId') IS NULL OR JSON_EXTRACT(quote_snapshot,'$.breakdown.totalAmount') IS NULL OR JSON_LENGTH(JSON_EXTRACT(quote_snapshot,'$.breakdown.feeItems'))<1 OR JSON_LENGTH(JSON_EXTRACT(quote_snapshot,'$.standards'))<3")
} finally {
  Pop-Location
}

Write-Host "check-phase16-migration-verification: passed"
