# Phase 19 gate: enterprise module cannot execute financial flows or Phase 20 dispatch.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend\src\enterprise") -Filter "*.ts" -File -Recurse
$Violations = @()
foreach ($file in $Files) {
  $content = Get-Content -Raw $file.FullName
  $relative = $file.FullName.Substring($Root.Length + 1)
  foreach ($pattern in @(
    '(?im)^\s*import .*\/(payment|ledger|settlement|dispatch|aftersale/refund)',
    '(?im)\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(payment_orders|ledger_|settlement_|dispatch_|aftersale_refund_requests)',
    '(?im)\b(payout|withdrawal|executeRefund|providerRefund|assignWorker|workerLocation|amap)\b'
  )) { if ($content -match $pattern) { $Violations += "$relative matched forbidden Phase 19 pattern: $pattern" } }
}
$migration = Get-Content -Raw (Join-Path $Root "db\migrations\037_phase19_enterprise_openapi_webhooks.sql")
foreach ($required in @(
  "city_code <> '__global__'",
  "secret_hash CHAR(64) NOT NULL",
  "UNIQUE KEY uq_business_order_external (city_code, business_client_id, external_order_id)",
  "UNIQUE KEY uq_business_order_idempotency (city_code, business_client_id, idempotency_key)",
  "UNIQUE KEY uq_business_delivery_subscription_event (city_code, subscription_id, event_id)",
  "status IN ('pending','delivered','retry_wait','dead_letter')"
)) { if (-not $migration.Contains($required)) { $Violations += "migration 037 missing boundary: $required" } }
$hardening = Get-Content -Raw (Join-Path $Root "db\migrations\038_phase19_enterprise_tenant_hardening.sql")
foreach ($required in @(
  "fk_business_order_agreement_client",
  "FOREIGN KEY (city_code, business_client_id, agreement_price_id)",
  "fk_business_delivery_subscription_client",
  "FOREIGN KEY (city_code, business_client_id, subscription_id)"
)) { if (-not $hardening.Contains($required)) { $Violations += "migration 038 missing tenant hardening: $required" } }
$openapi = Get-Content -Raw (Join-Path $Root "docs\openapi\phase19-enterprise-v1.yaml")
foreach ($required in @("openapi: 3.1.0","X-XLB-API-Key","enterprise:orders:write","/openapi/v1/webhook-subscriptions")) { if (-not $openapi.Contains($required)) { $Violations += "OpenAPI document missing: $required" } }
if ($Violations.Count) { Write-Host "check-phase19-boundaries: FAILED"; $Violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase19-boundaries: passed"
