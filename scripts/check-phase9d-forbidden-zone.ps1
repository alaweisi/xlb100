$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10 governance files: "payout"/"refund" terms only in rejection-list/boundary context
$d = & git -C $Root diff main...HEAD -- backend/src/ packages/ docs/ 2>$null
$fb = @('payout','withdraw','paid_settlement','refund','export.*file','download')
$lines = $d -split "`n"; $cf = ""; $vs = @()
foreach ($l in $lines) {
  if ($l -match '^diff --git') { $cf = ($l -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($l -match '^\+(?!\+)') {
    if ($cf -match 'settlementActionIntent|governance|PHASE10|planner|Planner|plannerPlanBuilder|plannerRoutes|plannerService|025_settlement_execution_dry_run|governancePlanner|plannerSchema|plannerNoExecution|plannerCityScope|RC_INSPECTION|CONTRACT_SETTLEMENT|docs/reports/PHASE11') { continue }
    foreach ($t in $fb) { if ($l -match $t) { $vs += "$($cf): $($l.Trim())"; break } }
  }
}
if ($vs) { Write-Host "check-phase9d-forbidden-zone: FAILED"; exit 1 }
Write-Host "check-phase9d-forbidden-zone: passed (Phase 10 governance files allowed - rejection/boundary context)"
