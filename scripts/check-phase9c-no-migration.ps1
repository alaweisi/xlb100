$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
if ($diff | Select-String "db/migrations/02[2-9]|db/migrations/03") { Write-Host "check-phase9c-no-migration: FAILED"; exit 1 }
Write-Host "check-phase9c-no-migration: passed"
