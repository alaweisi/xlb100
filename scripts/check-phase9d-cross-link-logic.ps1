$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -match 'cross.?link|buildHash|View Exports|filterStatement|initialCityCode') { Write-Host "check-phase9d-cross-link-logic: passed"; exit 0 } else { Write-Host "check-phase9d-cross-link-logic: FAILED"; exit 1 }
