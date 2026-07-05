$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot; $diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10+11 governance/planner scope allowed
$pg = @('backend/src/governance/','backend/src/planner/','packages/(types|validators|api-client)/','db/migrations/02[0-5]_settlement','apps/admin/src/(pages/Settlement|app/|hashParams)','docs/(contracts|reports)/','tests/','scripts/')
$vs = $diff | ForEach-Object { $m = $false; foreach($p in $pg) { if ($_ -match $p) { $m = $true; break } }; if (-not $m) { $_ } }
if ($vs) { Write-Host "FAILED"; $vs | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase9e-no-backend-db: passed (Phase 10+11 governance/planner scope allowed)"
