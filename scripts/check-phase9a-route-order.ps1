# Phase 9A gate: route order — only preparation envelope files allowed in backend.
# Phase 12 preparation envelope — governance-only, no execution, no money movement
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff --name-only main...HEAD 2>$null

# Allow ONLY exact preparation envelope files
$allowed = @(
  "backend/src/preparation/envelopeRoutes.ts",
  "backend/src/preparation/envelopeService.ts"
)

$vs = $diff | ForEach-Object {
  $f = $_.Trim()
  if ($f -match 'backend/src/' -and $f -ne 'backend/src/app.ts') {
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
  Write-Host "check-phase9a-route-order: FAILED"
  $vs | ForEach-Object { Write-Host "  $_" }
  exit 1
}
Write-Host "check-phase9a-route-order: passed (only preparation envelope files allowed)"
