$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10 governance backend allowed
$vs = $diff | Select-String "backend/src/" | Where-Object { $_ -notmatch 'backend/src/governance/|planner/' -and $_ -notmatch 'backend/src/app\.ts' }
if ($vs) { Write-Host "check-phase9b-route-order: FAILED"; exit 1 }
Write-Host "check-phase9b-route-order: passed (Phase 10 governance backend allowed)"
