$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot; $diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10+11+12 governance/planner/preparation backend allowed
$vs = $diff | Select-String "backend/src/" | Where-Object { $_ -notmatch 'backend/src/(governance|planner|preparation)/' -and $_ -ne 'backend/src/app.ts' }
if ($vs) { Write-Host "check-phase9c-no-backend-change: FAILED"; exit 1 }
Write-Host "check-phase9c-no-backend-change: passed (Phase 10+11+12 backend allowed)"
