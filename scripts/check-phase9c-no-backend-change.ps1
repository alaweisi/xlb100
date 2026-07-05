# Phase 9C gate: no backend changes except preparation envelope and app.ts.
# Phase 12 preparation envelope — governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null

# Allow ONLY exact preparation envelope files + app.ts
$allowed = @(
  "backend/src/preparation/envelopeRoutes.ts",
  "backend/src/preparation/envelopeService.ts",
  "backend/src/app.ts"
)

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match 'backend/src/' -and $f -notmatch '^$') {
    $ok = $false
    foreach ($a in $allowed) {
      if (($f -replace '\\', '/') -eq ($a -replace '\\', '/')) {
        $ok = $true
        break
      }
    }
    if (-not $ok) { $f }
  }
}

if ($vs) {
  Write-Host "check-phase9c-no-backend-change: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9c-no-backend-change: passed (only preparation envelope + app.ts allowed)"
