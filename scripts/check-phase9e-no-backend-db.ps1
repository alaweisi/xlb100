$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null | ForEach-Object { $_.Trim() }
# Phase 10 governance + Phase 9A ops page modifications allowed
$vs = $diff | Where-Object {
  $_ -notmatch 'backend/src/governance/|planner/|planner/' -and
  $_ -notmatch 'packages/(types|validators|api-client)/' -and
  $_ -notmatch 'db/migrations/02[0-3]_settlement_action_governance' -and
  $_ -notmatch 'apps/admin/src/pages/Settlement' -and
  $_ -ne 'apps/admin/src/app/App.tsx' -and $_ -ne 'apps/admin/src/hashParams.ts' -and $_ -ne 'apps/admin/vite.config.ts' -and
  $_ -ne 'backend/src/app.ts' -and
  $_ -notmatch 'docs/(contracts|reports)/' -and
  $_ -notmatch 'tests/(unit|security|contract)/' -and
  $_ -notmatch 'scripts/'
}
if ($vs) { Write-Host "check-phase9e-no-backend-db: FAILED"; $vs | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-phase9e-no-backend-db: passed (Phase 10 governance scope allowed)"
