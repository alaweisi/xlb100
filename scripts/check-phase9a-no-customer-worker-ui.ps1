$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($diff | Select-String "apps/customer|apps/worker") { Write-Host "check-phase9a-no-customer-worker-ui: FAILED"; exit 1 }
Write-Host "check-phase9a-no-customer-worker-ui: passed"