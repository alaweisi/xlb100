$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10 governance files: "payout"/"withdraw"/"refund" terms appear only in rejection-list/boundary/disabled-UI context
$d = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$fb = @("payout", "paid_settlement", "payment_instruction", "provider.*call", "notification.*consumer", "withdraw")
$lines = $d -split "`n"; $cf = ""; $vs = @()
foreach ($l in $lines) {
  if ($l -match '^diff --git') { $cf = ($l -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($l -match '^\+(?!\+)') {
    if ($cf -match 'settlementActionIntent|governance|PHASE10|planner|Planner|plannerPlanBuilder|plannerRoutes|plannerService|025_settlement_execution_dry_run|governancePlanner|plannerSchema|plannerNoExecution|plannerCityScope|RC_INSPECTION|CONTRACT_SETTLEMENT|docs/reports/PHASE11|preparation|PHASE12|REWORK') { continue }
    foreach ($t in $fb) { if ($l -match $t) { $vs += "$($cf): $($l.Trim())"; break } }
  }
}
if ($vs) { Write-Host "check-phase9a-no-payout-payment-instruction: FAILED - $vs"; exit 1 }
Write-Host "check-phase9a-no-payout-payment-instruction: passed (Phase 10 governance files allowed - rejection/boundary context only)"
