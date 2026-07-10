# Phase 18 gate: migration, provider truthfulness, file safety, and customer confirmation workflow.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$MysqlContainer = "xlb-mysql-local"

function Invoke-Scalar([string]$Sql) {
  $raw = & docker exec -e MYSQL_PWD=xlb_local_password $MysqlContainer mysql -uxlb --default-character-set=utf8mb4 -N -B xlb_local -e $Sql
  if ($LASTEXITCODE -ne 0) { throw "MySQL query failed: $Sql" }
  return (($raw | Out-String).Trim())
}

function Assert-Equal([string]$Label, [string]$Expected, [string]$Actual) {
  if ($Actual -ne $Expected) { throw "$Label expected $Expected but found $Actual" }
  Write-Host "PASS $Label = $Actual"
}

$health = (& docker inspect --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}" $MysqlContainer 2>$null | Out-String).Trim()
if ($LASTEXITCODE -ne 0 -or $health -ne "healthy") { throw "$MysqlContainer must be running and healthy; current status: $health" }

Push-Location $Root
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
  if ($LASTEXITCODE -ne 0) { throw "local migration failed" }

  Assert-Equal "migration 035 applied once" "1" (Invoke-Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='035_phase18_fulfillment_evidence_object_storage'")
  Assert-Equal "migration 036 applied once" "1" (Invoke-Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='036_phase18_city_reference_hardening'")
  Assert-Equal "Phase 18 table count" "3" (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('media_assets','fulfillment_evidence','fulfillment_customer_confirmations')")
  Assert-Equal "Phase 18 global city rows" "0" (Invoke-Scalar "SELECT (SELECT COUNT(*) FROM media_assets WHERE city_code='__global__')+(SELECT COUNT(*) FROM fulfillment_evidence WHERE city_code='__global__')+(SELECT COUNT(*) FROM fulfillment_customer_confirmations WHERE city_code='__global__')")
  Assert-Equal "external provider executions" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE external_provider_executed<>0")
  Assert-Equal "public evidence URLs" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE public_url IS NOT NULL")
  Assert-Equal "unsupported storage providers" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE storage_provider NOT IN ('local','mock')")
  Assert-Equal "invalid evidence sizes or MIME types" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE size_bytes NOT BETWEEN 1 AND 5242880 OR content_type NOT IN ('image/jpeg','image/png','image/webp')")
  Assert-Equal "Phase 18 composite city foreign keys" "7" (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name IN ('fk_media_city_order_fulfillment','fk_media_city_order_complaint','fk_evidence_city_order_fulfillment','fk_evidence_city_order_media','fk_evidence_city_order_complaint','fk_confirmation_city_order_fulfillment','fk_confirmation_city_order_complaint')")

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase18-boundaries.ps1
  if ($LASTEXITCODE -ne 0) { throw "Phase 18 boundary gate failed" }

  & npx.cmd vitest run tests/contract/evidence.contract.test.ts tests/unit/evidenceFileSafety.test.ts tests/unit/objectStorageProvider.test.ts tests/unit/customerConfirmationStateMachine.test.ts tests/integration/phase18FulfillmentEvidence.test.ts tests/security/phase18EvidenceSecurity.test.ts
  if ($LASTEXITCODE -ne 0) { throw "Phase 18 contract/unit/integration/security tests failed" }

  Assert-Equal "external provider executions after tests" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE external_provider_executed<>0")
  Assert-Equal "public evidence URLs after tests" "0" (Invoke-Scalar "SELECT COUNT(*) FROM media_assets WHERE public_url IS NOT NULL")
} finally {
  Pop-Location
}

Write-Host "check-phase18-migration-verification: passed"
