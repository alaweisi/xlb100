$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot; $diff = & git -C $Root diff --name-only main...HEAD 2>$null
$pg = @('backend/src/governance/','backend/src/planner/','backend/src/preparation/','backend/src/app\.ts','packages/(types|validators|api-client)/','db/migrations/02[0-6]_settlement','apps/admin/src/(pages/Settlement|app/|hashParams)','docs/(contracts|reports)/','tests/','scripts/')
$vs = $diff | ForEach-Object { $m = $false; foreach($p in $pg) { if ($_ -match $p) { $m = $true; break } }; if (-not $m) { $_ } }
if ($vs) { Write-Host "FAILED"; $vs | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase9d-no-backend-db-ui: passed (Phase 10+11+12 scope allowed)"
