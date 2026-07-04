$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($diff | Select-String "backend/src/") { Write-Host "check-phase9c-no-backend-change: FAILED"; exit 1 }
Write-Host "check-phase9c-no-backend-change: passed"
