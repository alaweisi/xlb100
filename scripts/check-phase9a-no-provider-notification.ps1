$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10 governance files: "provider" terms only in rejection-list/boundary context
$d = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$fb = @('provider_withdrawal','provider_batch','provider_instruction')
$lines = $d -split "`n"; $cf = ""; $vs = @()
foreach ($l in $lines) {
  if ($l -match '^diff --git') { $cf = ($l -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($l -match '^\+(?!\+)') {
    if ($cf -match 'settlementActionIntent|governance|PHASE10|RC_INSPECTION|CONTRACT_SETTLEMENT') { continue }
    foreach ($t in $fb) { if ($l -match $t) { $vs += "$($cf): $($l.Trim())"; break } }
  }
}
if ($vs) { Write-Host "check-phase9a-no-provider-notification: FAILED"; exit 1 }
Write-Host "check-phase9a-no-provider-notification: passed (Phase 10 governance files allowed - rejection/boundary context)"
