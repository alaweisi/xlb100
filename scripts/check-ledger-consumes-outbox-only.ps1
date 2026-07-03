$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Consumer = Get-Content -Raw (Join-Path $Root "backend/src/ledger/ledgerOutboxConsumer.ts")
if ($Consumer -notmatch 'findPendingEventsByType' -or $Consumer -notmatch 'fulfillment\.completed') {
  throw "Ledger consumer must query pending fulfillment.completed outbox events."
}
if ($Consumer -match 'order\.paid|payment\.paid|fulfillment\.started') {
  throw "Ledger consumer may only consume fulfillment.completed."
}
Write-Host "PASS: ledger consumes fulfillment.completed from outbox only."
