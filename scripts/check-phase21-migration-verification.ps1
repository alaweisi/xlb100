$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Mysql = "xlb-mysql-local"
function Scalar([string]$sql) {
  $raw = & docker exec -e MYSQL_PWD=xlb_local_password $Mysql mysql -uxlb -N -B xlb_local -e $sql
  if ($LASTEXITCODE -ne 0) { throw "SQL failed" }
  return (($raw | Out-String).Trim())
}
function Equal($label, $expected, $actual) {
  if ($actual -ne $expected) { throw "$label expected $expected found $actual" }
  Write-Host "PASS $label = $actual"
}
Push-Location $Root
try {
  & powershell -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
  if ($LASTEXITCODE -ne 0) { throw "migration failed" }
  Equal "migration 040 once" "1" (Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='040_phase21_customer_operations'")
  Equal "migration 041 once" "1" (Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='041_phase21_customer_address_idempotency'")
  Equal "Phase 21 customer tables" "1" (Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='customer_addresses'")
  Equal "global customer addresses" "0" (Scalar "SELECT COUNT(*) FROM customer_addresses WHERE city_code='__global__'")
  Equal "orphan customer addresses" "0" (Scalar "SELECT COUNT(*) FROM customer_addresses a LEFT JOIN customers c ON c.id=a.customer_id WHERE c.id IS NULL")
  Equal "real geo provider executions" "0" (Scalar "SELECT COUNT(*) FROM dispatch_offers WHERE JSON_EXTRACT(geo_provider_envelope_json,'$.externalProviderExecuted')=true")
  & powershell -ExecutionPolicy Bypass -File scripts/check-phase21-boundaries.ps1
  if ($LASTEXITCODE -ne 0) { throw "boundary failed" }
  & npx.cmd vitest run tests/contract/phase21Operations.contract.test.ts tests/integration/phase21CustomerOperations.test.ts tests/integration/phase21AdminOperations.test.ts tests/integration/phase21CoreJourney.test.ts tests/security/phase21RoleMatrix.test.ts tests/unit/customerProfileOperationsPage.test.tsx tests/unit/platformOperationsPage.test.tsx tests/unit/workerApp.test.tsx
  if ($LASTEXITCODE -ne 0) { throw "Phase 21 tests failed" }
  & npx.cmd pnpm test:e2e:phase21
  if ($LASTEXITCODE -ne 0) { throw "Phase 21 browser smoke failed" }
} finally { Pop-Location }
Write-Host "check-phase21-migration-verification: passed"
