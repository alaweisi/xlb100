# Phase 9A gate: no migration changes except Phase 12 preparation envelope.
# Phase 12 preparation envelope 鈥?governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null

# Allow later-phase migrations that have their own append-only verification gates.
$allowed = @(
  "db/migrations/026_settlement_execution_preparation_envelope.sql",
  "db/migrations/027_aftersale_refund_reversal.sql",
  "db/migrations/040_phase21_customer_operations.sql",
  "db/migrations/041_phase21_customer_address_idempotency.sql",
  "db/migrations/042_phase22_enterprise_order_tenant_immutability.sql",
  "db/migrations/043_phase23a_worker_phone_identity_hash.sql",
  "db/migrations/044_phase23b_event_outbox_reliability.sql",
  "db/migrations/045_phase23c_frontend_engineering.sql",
  "db/migrations/046_phase23d_query_path_indexes.sql",
  "db/migrations/047_phase24b_support_ticket_mvp.sql",
  "db/migrations/048_phase24c_support_agents_skill_groups.sql"
)

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match 'db/migrations/' -and $f -notmatch '^$') {
    $ok = $false
    foreach ($a in $allowed) {
      # Normalize paths for comparison
      if (($f -replace '\\', '/') -eq ($a -replace '\\', '/')) {
        $ok = $true
        break
      }
    }
    if (-not $ok) { $f }
  }
}

if ($vs) {
  Write-Host "check-phase9a-no-migration: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9a-no-migration: passed (exact later-phase migration allowlist)"
