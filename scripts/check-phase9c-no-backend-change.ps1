$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot; $diff = & git -C $Root diff --name-only main...HEAD 2>$null
$vs = $diff | ForEach-Object { $f = $_.Trim(); if ($f -match 'backend/src/' -and $f -notmatch 'backend/src/(governance|planner|preparation)/' -and $f -ne 'backend/src/app.ts') { $f } }
if ($vs) { Write-Host "check-phase9c-no-backend-change: FAILED"; exit 1 }
Write-Host "check-phase9c-no-backend-change: passed (Phase 10+11+12 backend allowed)"
