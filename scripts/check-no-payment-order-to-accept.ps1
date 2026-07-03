# Phase 7A gate: payment/order must not import or call accept/fulfillment
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\payment"),
  (Join-Path $Root "backend\src\order")
)

$forbidden = @(
  "workerAccept",
  "workerAcceptService",
  "fulfillmentService",
  "/accept",
  "acceptTask"
)

$hits = @()
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  $files = Get-ChildItem -Path $dir -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    foreach ($pattern in $forbidden) {
      $found = Select-String -Path $file.FullName -Pattern $pattern -SimpleMatch -ErrorAction SilentlyContinue
      if ($found) { $hits += $found }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-no-payment-order-to-accept FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-no-payment-order-to-accept: passed"
