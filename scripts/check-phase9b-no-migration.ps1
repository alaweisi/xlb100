# Phase 9B gate: no migration changes except Phase 12 preparation envelope.
# Phase 12 preparation envelope 鈥?governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
$currentState = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $Root 'docs/CURRENT_STATE.md')
$phase29Entry = Join-Path $Root 'docs/reports/PHASE29_MARKETING_COUPON_ENTRY_REPORT.md'
$phase29Architecture = Join-Path $Root 'docs/architecture/29_XLB_MARKETING_COUPON.md'
$phase29Contract = Join-Path $Root 'docs/contracts/CONTRACT_MARKETING_COUPON.md'
$phase29Registry = Join-Path $Root 'docs/governance/phase-registry.json'
$phase29Authorized =
  ($currentState.Contains('| Phase 29 | IN PROGRESS |') -or $currentState.Contains('| Phase 29 | LOCKED |')) -and
  $currentState.Contains('D01') -and
  $currentState.Contains('D24') -and
  (Test-Path -LiteralPath $phase29Entry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('Every row below is **HUMAN APPROVED**') -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Entry).Contains('| D24 |') -and
  (Test-Path -LiteralPath $phase29Architecture) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Architecture).Contains('ENTRY DECISIONS HUMAN-APPROVED; CONSTRUCTION AUTHORIZED') -and
  (Test-Path -LiteralPath $phase29Contract) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Contract).Contains('Phase 29 human-approved contract') -and
  (Test-Path -LiteralPath $phase29Registry) -and
  (Get-Content -Raw -Encoding UTF8 -LiteralPath $phase29Registry).Contains('Entry decisions D01-D24 are approved for continuous construction through independent acceptance.')

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
  "db/migrations/048_phase24c_support_agents_skill_groups.sql",
  "db/migrations/049_phase24c_support_routing_sla_policies.sql",
  "db/migrations/050_phase24c_support_sla_breach_workbench.sql",
  "db/migrations/051_phase24d_support_realtime_conversations.sql",
  "db/migrations/052_phase24e_support_bot_knowledge_base.sql",
  "db/migrations/053_phase24f_support_quality.sql",
  "db/migrations/054_phase27a_platform_delivery_foundation.sql",
  "db/migrations/055_phase27b_notification_projection_foundation.sql"
)
if ($phase29Authorized) {
  $allowed += 'db/migrations/057_phase29_marketing_coupon.sql'
}

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match 'db/migrations/' -and $f -notmatch '^$') {
    $ok = $false
    foreach ($a in $allowed) {
      if (($f -replace '\\', '/') -eq ($a -replace '\\', '/')) {
        $ok = $true
        break
      }
    }
    if (-not $ok) { $f }
  }
}

if ($vs) {
  Write-Host "check-phase9b-no-migration: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9b-no-migration: passed (exact later-phase migration allowlist)"
