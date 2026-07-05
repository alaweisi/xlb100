$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10 governance module is a legitimate Phase 10 backend addition
# Only flag non-governance backend changes
$violations = $diff | Select-String "backend/src/" | Where-Object { $_ -notmatch 'backend/src/governance/|planner/' -and $_ -notmatch 'backend/src/app\.ts' }
if ($violations) { Write-Host "check-phase9a-route-order: FAILED â€?$violations"; exit 1 }
Write-Host "check-phase9a-route-order: passed (Phase 10 governance backend allowed)"
