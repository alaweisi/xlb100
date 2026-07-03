# Historical Phase 7A gate: inspect the frozen Phase 7A tag, not current Phase 7B sources.
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Tag = "xlb-phase7a-worker-accept-fulfillment-skeleton"

Push-Location $Root
try {
  & git rev-parse --verify --quiet $Tag *> $null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "check-no-fulfillment-complete-in-phase7a FAILED: missing tag $Tag"
    exit 1
  }

  $hits = & git grep -n -E "/complete|/start|completeFulfillment|startFulfillment" $Tag -- backend/src/fulfillment backend/src/worker 2>$null
  if ($LASTEXITCODE -eq 0) {
    Write-Host "check-no-fulfillment-complete-in-phase7a FAILED against ${Tag}:"
    $hits | ForEach-Object { Write-Host "  $_" }
    exit 1
  }
  if ($LASTEXITCODE -gt 1) {
    Write-Host "check-no-fulfillment-complete-in-phase7a FAILED: git grep error"
    exit 1
  }
} finally {
  Pop-Location
}

Write-Host "check-no-fulfillment-complete-in-phase7a: passed (frozen tag $Tag)"
