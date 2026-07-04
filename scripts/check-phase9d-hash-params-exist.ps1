$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$helper = Join-Path $Root "apps/admin/src/hashParams.ts"
if (Test-Path $helper) { Write-Host "check-phase9d-hash-params-exist: passed" } else { Write-Host "check-phase9d-hash-params-exist: FAILED"; exit 1 }
