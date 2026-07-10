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
  Equal "migration 042 once" "1" (Scalar "SELECT COUNT(*) FROM schema_migrations WHERE version='042_phase22_enterprise_order_tenant_immutability'")
  Equal "enterprise ownership table" "1" (Scalar "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='business_order_tenant_ownership'")
  Equal "enterprise ownership FK" "1" (Scalar "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema=DATABASE() AND constraint_name='fk_business_order_tenant_ownership'")
  Equal "orphan enterprise ownership" "0" (Scalar "SELECT COUNT(*) FROM business_order_tenant_ownership o LEFT JOIN business_orders b ON b.city_code=o.city_code AND b.business_client_id=o.business_client_id AND b.order_id=o.order_id WHERE b.order_id IS NULL")
  Equal "real geo provider executions" "0" (Scalar "SELECT COUNT(*) FROM dispatch_offers WHERE JSON_EXTRACT(geo_provider_envelope_json,'$.externalProviderExecuted')=true")
  Equal "real storage provider executions" "0" (Scalar "SELECT COUNT(*) FROM media_assets WHERE external_provider_executed=1")
  Equal "real webhook provider executions" "0" (Scalar "SELECT COUNT(*) FROM business_webhook_deliveries WHERE JSON_EXTRACT(provider_envelope_json,'$.externalProviderExecuted')=true")
  & powershell -ExecutionPolicy Bypass -File scripts/check-phase22-boundaries.ps1
  if ($LASTEXITCODE -ne 0) { throw "Phase 22 boundary failed" }
} finally { Pop-Location }
Write-Host "check-phase22-migration-verification: passed"
