# Phase 7A gate: fulfillment skeleton must not import ledger/settlement/refund
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$paths = @(
  (Join-Path $Root "backend\src\fulfillment"),
  (Join-Path $Root "backend\src\worker\workerAcceptService.ts")
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
foreach ($dir in $paths) {
  if (-not (Test-Path $dir)) { continue }
  if (Test-Path $dir -PathType Leaf) {
    $files = @(Get-Item $dir)
  } else {
    $files = Get-ChildItem -Path $dir -Filter "*.ts" -Recurse -ErrorAction SilentlyContinue
  }
  foreach ($file in $files) {
    if ($file.Name -eq "README.md") { continue }
    $content = Get-Content $file.FullName -Raw
    foreach ($pattern in $forbidden) {
      if ($content -match [regex]::Escape($pattern)) {
        $hits += "$($file.FullName): $pattern"
      }
    }
  }
}

if ($hits.Count -gt 0) {
  Write-Host "check-fulfillment-skeleton-no-ledger FAILED:"
  $hits | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-fulfillment-skeleton-no-ledger: passed"
