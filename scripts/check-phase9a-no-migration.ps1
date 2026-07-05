$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10+11+12 governance/planner/preparation migrations allowed
$allowed = @("db/migrations/02[0-6]_settlement")
$vs = $diff | Select-String "db/migrations/02[2-9]" | ForEach-Object { $line = $_.Line; $ok = $false; foreach($a in $allowed) { if ($line -match $a) { $ok = $true; break } }; if (-not $ok) { $line } }
if ($vs) { Write-Host "check-phase9a-no-migration: FAILED"; exit 1 }
Write-Host "check-phase9a-no-migration: passed (Phase 10+11+12 migrations allowed)"
