$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null
# Phase 10 governance migrations are allowed (020-023); only 022+ non-governance migrations fail
$violations = $diff | Select-String "db/migrations/02[2-9]" | Where-Object { $_ -notmatch 'settlement_action_governance|025_settlement_execution_dry_run' }
if ($violations) { Write-Host "check-phase9a-no-migration: FAILED â€?$violations"; exit 1 }
Write-Host "check-phase9a-no-migration: passed (Phase 10 governance migrations allowed)"
