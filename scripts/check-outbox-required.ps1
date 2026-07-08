# Phase 4 gate: mock webhook must write event_outbox events
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$servicePath = Join-Path $Root "backend\src\payment\paymentOrderService.ts"
$errors = @()

if (-not (Test-Path $servicePath)) {
  Write-Host "check-outbox-required FAILED: missing paymentOrderService.ts"
  exit 1
}

$content = Get-Content $servicePath -Raw -Encoding UTF8

if ($content -notmatch "insertEvent") {
  $errors += "paymentOrderService must call insertEvent on outbox"
}
if ($content -notmatch "payment\.paid") {
  $errors += "paymentOrderService must write payment.paid event"
}
if ($content -match "eventType:\s*`"order\.paid`"") {
  $errors += "paymentOrderService must not write order.paid event after Stage 7"
}
if ($content -match "dispatchService|dispatchStream|workerMatcher") {
  $errors += "paymentOrderService must not call dispatch"
}

if ($errors.Count -gt 0) {
  Write-Host "check-outbox-required FAILED:"
  $errors | ForEach-Object { Write-Host "  - $_" }
  exit 1
}

Write-Host "check-outbox-required: passed"
