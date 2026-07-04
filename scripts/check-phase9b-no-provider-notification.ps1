$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -match '\b(provider|notification|sms|push|email)\b') { Write-Host "check-phase9b-no-provider-notification: FAILED"; exit 1 }
Write-Host "check-phase9b-no-provider-notification: passed"
