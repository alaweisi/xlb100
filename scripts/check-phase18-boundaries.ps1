# Phase 18 gate: evidence storage stays local/mock, private, scoped, and non-financial.
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
    '(?im)\b(aliyun|alicloud|aws-sdk|amazon\s+s3|qiniu|tencent\s*cos)\b',
    '(?im)externalProviderExecuted\s*:\s*true',
    '(?im)publicUrl\s*:\s*["''`][^"''`]+',
    '(?im)https?://'
  )
  foreach ($pattern in $forbidden) {
    if ($content -match $pattern) { $Violations += "$relative matched forbidden Phase 18 pattern: $pattern" }
  }
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
