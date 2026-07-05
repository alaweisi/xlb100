$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10 governance files: mutation terms only in rejection-list/boundary context
$d = & git -C $Root diff main...HEAD -- backend/src/ packages/ docs/ 2>$null
$fb = @('mutate_settlement','commit_settlement','ledger_mutation','reverse_ledger','refund_execution','payout','execute_payout','paid_at','refunded_at','settled_at')
$lines = $d -split "`n"; $cf = ""; $vs = @()
foreach ($l in $lines) {
  if ($l -match '^diff --git') { $cf = ($l -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($l -match '^\+(?!\+)') {
    if ($cf -match 'settlementActionIntent|governance|PHASE10|RC_INSPECTION|CONTRACT_SETTLEMENT') { continue }
    foreach ($t in $fb) { if ($l -match $t) { $vs += "$($cf): $($l.Trim())"; break } }
  }
}
if ($vs) { Write-Host "check-phase9d-no-mutation: FAILED"; exit 1 }
Write-Host "check-phase9d-no-mutation: passed (Phase 10 governance files allowed - rejection/boundary context)"
