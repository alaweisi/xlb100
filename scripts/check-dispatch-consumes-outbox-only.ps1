# Phase 5A gate: dispatch must consume event_outbox order.paid only
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$dispatchDir = Join-Path $Root "backend\src\dispatch"
$serviceFile = Join-Path $dispatchDir "dispatchService.ts"

if (-not (Test-Path $serviceFile)) {
  Write-Host "check-dispatch-consumes-outbox-only FAILED: dispatchService.ts missing"
  exit 1
}

$content = Get-Content $serviceFile -Raw

if ($content -notmatch "order\.paid") {
  Write-Host "check-dispatch-consumes-outbox-only FAILED: dispatchService must reference order.paid"
  exit 1
}

if ($content -notmatch "eventOutbox|EventOutbox") {
  Write-Host "check-dispatch-consumes-outbox-only FAILED: dispatchService must use event outbox"
  exit 1
}

$paymentWebhook = Join-Path $Root "backend\src\payment\paymentWebhook.ts"
$webhookContent = Get-Content $paymentWebhook -Raw
if ($webhookContent -match "dispatchService|runDispatchOutboxOnce|dispatchModule") {
  Write-Host "check-dispatch-consumes-outbox-only FAILED: payment webhook must not trigger dispatch"
  exit 1
}

Write-Host "check-dispatch-consumes-outbox-only: passed"
