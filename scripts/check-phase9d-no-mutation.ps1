$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
if ($diff -match '\b(POST|PUT|PATCH|DELETE|post|put|patch|delete)\b') { Write-Host "check-phase9d-no-mutation: FAILED"; exit 1 }
Write-Host "check-phase9d-no-mutation: passed"
