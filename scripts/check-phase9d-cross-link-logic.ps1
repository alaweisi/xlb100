$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -notmatch 'cross.?link|nav|hash.?param|hash.?query|buildHash|View Exports|filterStatement') { Write-Host "check-phase9d-cross-link-logic: FAILED"; exit 1 }
Write-Host "check-phase9d-cross-link-logic: passed"
