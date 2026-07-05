# Phase 9A gate: no migration changes except Phase 12 preparation envelope.
# Phase 12 preparation envelope — governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null

# Allow ONLY the Phase 12 preparation envelope migration
$allowed = @(
  "db/migrations/026_settlement_execution_preparation_envelope.sql"
)

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match 'db/migrations/' -and $f -notmatch '^$') {
    $ok = $false
    foreach ($a in $allowed) {
      # Normalize paths for comparison
      if (($f -replace '\\', '/') -eq ($a -replace '\\', '/')) {
        $ok = $true
        break
      }
    }
    if (-not $ok) { $f }
  }
}

if ($vs) {
  Write-Host "check-phase9a-no-migration: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9a-no-migration: passed (only Phase 12 preparation envelope migration allowed)"
