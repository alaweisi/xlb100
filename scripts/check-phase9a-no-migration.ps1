$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($diff | Select-String "db/migrations/02[2-9]") { Write-Host "check-phase9a-no-migration: FAILED"; exit 1 }
Write-Host "check-phase9a-no-migration: passed"