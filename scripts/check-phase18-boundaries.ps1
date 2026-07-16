# Evidence storage gate: local/mock remain default; COS is private and double-gated.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$SourceFiles = @(
  Get-ChildItem (Join-Path $Root "backend\src\fulfillment\evidence") -Filter "*.ts" -File -Recurse
  Get-ChildItem (Join-Path $Root "backend\src\providers\objectStorage") -Filter "*.ts" -File -Recurse
)
$Violations = @()

foreach ($file in $SourceFiles) {
  $content = Get-Content -Raw $file.FullName
  $relative = $file.FullName.Substring($Root.Length + 1)
  $forbidden = @(
    '(?im)^\s*import .*\b(payment|ledger|dispatch|refund|settlement)\b',
    '(?im)\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(ledger_|payment_orders|aftersale_refund_requests|dispatch_offers|settlement_)',
    '(?im)publicUrl\s*:\s*["''`][^"''`]+',
    '(?im)https?://'
  )
  foreach ($pattern in $forbidden) {
    if ($content -match $pattern) { $Violations += "$relative matched forbidden Phase 18 pattern: $pattern" }
  }
}

$cosMigration = Get-Content -Raw (Join-Path $Root "db\migrations\059_tke_cos_object_storage.sql")
foreach ($required in @(
  "storage_provider IN ('local','mock','cos')",
  "storage_provider_name IN ('xlb-local-filesystem','xlb-memory-mock','tencent-cos')",
  "storage_provider = 'cos' AND storage_provider_status = 'stored_cos'",
  "storage_provider = 'cos' AND external_provider_executed = 1",
  "storage_provider = 'cos' AND storage_uri LIKE 'cos://%/%'",
  "059_tke_cos_object_storage"
)) {
  if (-not $cosMigration.Contains($required)) { $Violations += "migration 059 missing COS boundary: $required" }
}

$providerReadiness = Get-Content -Raw (Join-Path $Root "packages\config\src\providerReadiness.ts")
foreach ($required in @(
  "XLB_OBJECT_STORAGE_PROVIDER",
  "XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED",
  "Tencent COS requires XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true",
  "XLB_EXTERNAL_PROVIDER_EXECUTION_ENABLED=true requires XLB_OBJECT_STORAGE_PROVIDER=cos"
)) {
  if (-not $providerReadiness.Contains($required)) { $Violations += "provider readiness missing double gate: $required" }
}

$repository = Get-Content -Raw (Join-Path $Root "backend\src\fulfillment\evidence\fulfillmentEvidenceRepository.ts")
foreach ($required in @(
  "row.external_provider_executed === 1",
  "e.externalProviderExecuted ? 1 : 0"
)) {
  if (-not $repository.Contains($required)) { $Violations += "evidence repository downgrades external execution truth: $required" }
}

$service = Get-Content -Raw (Join-Path $Root "backend\src\fulfillment\evidence\fulfillmentEvidenceService.ts")
if (-not $service.Contains("externalProviderExecuted:envelope.externalProviderExecuted")) {
  $Violations += "evidence event must preserve the provider external execution flag"
}

$migration = Get-Content -Raw (Join-Path $Root "db\migrations\035_phase18_fulfillment_evidence_object_storage.sql")
foreach ($required in @(
  "city_code <> '__global__'",
  "storage_provider IN ('local','mock')",
  "external_provider_executed = 0",
  "public_url IS NULL",
  "size_bytes BETWEEN 1 AND 5242880",
  "content_type IN ('image/jpeg','image/png','image/webp')"
)) {
  if (-not $migration.Contains($required)) { $Violations += "migration 035 missing required boundary: $required" }
}

$cityHardening = Get-Content -Raw (Join-Path $Root "db\migrations\036_phase18_city_reference_hardening.sql")
foreach ($required in @(
  "FOREIGN KEY (city_code, order_id, fulfillment_id)",
  "FOREIGN KEY (city_code, order_id, complaint_id)",
  "FOREIGN KEY (city_code, order_id, fulfillment_id, media_asset_id)"
)) {
  if (-not $cityHardening.Contains($required)) { $Violations += "migration 036 missing required city-reference boundary: $required" }
}

if ($Violations.Count -gt 0) {
  Write-Host "check-phase18-boundaries: FAILED"
  $Violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase18-boundaries: passed"
