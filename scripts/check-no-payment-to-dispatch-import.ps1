# Phase 5A gate: payment/order/events must not import dispatch
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\order"),
  (Join-Path $Root "backend\src\payment"),
  (Join-Path $Root "backend\src\events")
)

$patterns = @(
  "backend/src/dispatch",
  "from `"../dispatch",
  "from '../dispatch",
  "dispatchService",
  "registerDispatchModule"
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
  Write-Host "check-no-payment-to-dispatch-import FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-payment-to-dispatch-import: passed"
