$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -match '\b(export-once|review-once|generate-once|prepare-once|confirm|mark-payable|enqueue-once)\b') { Write-Host "check-phase9c-no-export-mutation: FAILED"; exit 1 }
Write-Host "check-phase9c-no-export-mutation: passed"
