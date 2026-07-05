# Phase 9B gate: admin-only scope — Phase 10+11+12 allowed with exact paths.
# Phase 12 preparation envelope — governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null

# Exact allowed patterns with no broad category-level wildcards
$pg = @(
  # Phase 10 governance
  'backend/src/governance/',
  # Phase 11 planner
  'backend/src/planner/',
  # Phase 12 preparation envelope — exact files only
  'backend/src/preparation/envelopeRoutes\.ts',
  'backend/src/preparation/envelopeService\.ts',
  'backend/src/app\.ts',
  # Shared packages
  'packages/(types|validators|api-client)/',
  # Phase 12 migration — exact file only
  'db/migrations/026_settlement_execution_preparation_envelope\.sql',
  # Admin UI
  'apps/admin/src/(pages/Settlement|app/|hashParams)',
  # Docs and tests
  'docs/(contracts|reports)/',
  'tests/',
  # Scripts
  'scripts/'
)

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match '^$') { return }
  $m = $false
  foreach ($p in $pg) {
    if ($f -match $p) {
      $m = $true
      break
    }
  }
  if (-not $m) { $f }
}

if ($vs) {
  Write-Host "check-phase9b-admin-only-scope: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9b-admin-only-scope: passed (exact Phase 12 preparation paths allowed)"
