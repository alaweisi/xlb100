# Phase 4 gate: order flow must use official SKU in tests/examples
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$orderTests = @(
  (Join-Path $Root "tests\integration\paymentOrder.test.ts"),
  (Join-Path $Root "tests\integration\mockPaymentWebhook.test.ts"),
  (Join-Path $Root "tests\integration\orderPaymentOutbox.test.ts")
)

$errors = @()

$createTest = Join-Path $Root "tests\integration\orderCreate.test.ts"
if (-not (Test-Path $createTest)) {
  $errors += "missing tests/integration/orderCreate.test.ts"
} else {
  $createContent = Get-Content $createTest -Raw -Encoding UTF8
  if ($createContent -notmatch "sku_home_daily_2h") {
    $errors += "orderCreate.test.ts must reference official sku_home_daily_2h"
  }
  if ($createContent -notmatch "rejects demo") {
    $errors += "orderCreate.test.ts must include demo SKU rejection test"
  }
}

foreach ($path in $orderTests) {
  if (-not (Test-Path $path)) {
    $errors += "missing $path"
    continue
  }
  $content = Get-Content $path -Raw -Encoding UTF8
  if ($content -match "demo_cleaning_sku") {
    $errors += "$path must not use demo_cleaning_sku"
  }
  if ($content -notmatch "sku_home_daily_2h") {
    $errors += "$path must reference official sku_home_daily_2h"
  }
}

if ($errors.Count -gt 0) {
  Write-Host "check-order-requires-official-sku FAILED:"
  $errors | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "check-order-requires-official-sku: passed"
