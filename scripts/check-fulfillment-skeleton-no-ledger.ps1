# Phase 7A gate: fulfillment skeleton must not import ledger/settlement/refund
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$files = @(
  Get-ChildItem (Join-Path $Root "backend\src\fulfillment") -Filter "*.ts" -File
  Get-Item (Join-Path $Root "backend\src\worker\workerAcceptService.ts")
)

$forbidden = @(
  "ledgerService",
  "settlementService",
  "refundService",
  "aftersale",
  'from "../ledger',
  'from "../aftersale'
)

$hits = @()
# Phase 18 evidence is an independent submodule with its own stricter boundary gate.
foreach ($file in $files) {
  $content = Get-Content $file.FullName -Raw
  foreach ($pattern in $forbidden) {
    if ($content -match [regex]::Escape($pattern)) {
      $hits += "$($file.FullName): $pattern"
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-fulfillment-skeleton-no-ledger FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-fulfillment-skeleton-no-ledger: passed"
