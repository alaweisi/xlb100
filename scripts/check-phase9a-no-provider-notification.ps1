$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Search diff content (not just filenames) for forbidden notification/provider terms
# Exclude scripts/ and tests/ to avoid self-matching gate file names and test assertions
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -match '\b(provider|notification|sms|push|email)\b') {
  Write-Host "check-phase9a-no-provider-notification: FAILED — forbidden term found"; exit 1
}
Write-Host "check-phase9a-no-provider-notification: passed"
