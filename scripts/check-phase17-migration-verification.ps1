# Phase 17 gate: real MySQL migration, city scope, non-execution boundary, and workflow tests.
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
if ($LASTEXITCODE -ne 0 -or $health -ne "healthy") {
  throw "$MysqlContainer must be running and healthy; current status: $health"
}

Push-Location $Root
try {
  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
  if ($LASTEXITCODE -ne 0) { throw "local migration failed" }

  Assert-Equal "migration 034 applied once" "1" (Invoke-Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='034_phase17_order_reverse_aftersale_complaints'")
  Assert-Equal "Phase 17 table count" "6" (Invoke-Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('order_reverse_requests','aftersale_complaints','aftersale_repair_orders','aftersale_liability_decisions','aftersale_compensation_intents','aftersale_timeline_events')")
  Assert-Equal "Phase 17 global city rows" "0" (Invoke-Scalar "SELECT (SELECT COUNT(*) FROM order_reverse_requests WHERE city_code='__global__')+(SELECT COUNT(*) FROM aftersale_complaints WHERE city_code='__global__')+(SELECT COUNT(*) FROM aftersale_repair_orders WHERE city_code='__global__')+(SELECT COUNT(*) FROM aftersale_liability_decisions WHERE city_code='__global__')+(SELECT COUNT(*) FROM aftersale_compensation_intents WHERE city_code='__global__')+(SELECT COUNT(*) FROM aftersale_timeline_events WHERE city_code='__global__')")
  Assert-Equal "executed compensation intents" "0" (Invoke-Scalar "SELECT COUNT(*) FROM aftersale_compensation_intents WHERE provider_execution_status<>'not_executed'")

  & powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase17-boundaries.ps1
  if ($LASTEXITCODE -ne 0) { throw "Phase 17 boundary gate failed" }

  & npx.cmd vitest run tests/contract/aftersale.contract.test.ts tests/unit/orderReverseStateMachine.test.ts tests/unit/aftersaleStateMachines.test.ts tests/integration/phase17OrderReverseAftersale.test.ts tests/security/phase17Boundaries.test.ts
  if ($LASTEXITCODE -ne 0) { throw "Phase 17 contract/unit/integration/security tests failed" }

  Assert-Equal "executed compensation intents after tests" "0" (Invoke-Scalar "SELECT COUNT(*) FROM aftersale_compensation_intents WHERE provider_execution_status<>'not_executed'")
} finally {
  Pop-Location
}

Write-Host "check-phase17-migration-verification: passed"
