$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10 governance: allow governance backend + app.ts import
$vs = $diff | Where-Object { $_ -match 'backend/src/' -and $_ -notmatch 'backend/src/governance/|planner/' -and $_ -ne 'backend/src/app.ts' }
if ($vs) { Write-Host "check-phase9c-no-backend-change: FAILED â€?$vs"; exit 1 }
Write-Host "check-phase9c-no-backend-change: passed (Phase 10 governance backend allowed)"
