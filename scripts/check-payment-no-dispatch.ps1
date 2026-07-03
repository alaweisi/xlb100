# Phase 4 gate: payment must not invoke dispatch
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\order"),
  (Join-Path $Root "backend\src\payment"),
  (Join-Path $Root "backend\src\events")
)

$patterns = @(
  "dispatchService",
  "workerMatcher",
  "dispatchStream",
  "backend/src/dispatch"
)

$hits = @()
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  foreach ($pattern in $patterns) {
    $found = Select-String -Path (Join-Path $dir "*.ts") -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
    if ($found) { $hits += $found }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-payment-no-dispatch FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-payment-no-dispatch: passed"
