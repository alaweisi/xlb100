$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Consumer = Get-Content -Raw (Join-Path $Root "backend/src/ledger/ledgerOutboxConsumer.ts")
if ($Consumer -notmatch 'findPendingEventsByType' -or $Consumer -notmatch 'fulfillment\.completed' -or $Consumer -notmatch 'refund\.approved') {
  throw "Ledger consumer must query pending fulfillment.completed and refund.approved outbox events."
}
if ($Consumer -match 'order\.paid|payment\.paid|fulfillment\.started|refund\.requested') {
  throw "Ledger consumer may only consume fulfillment.completed and refund.approved."
}
Write-Host "PASS: ledger consumes fulfillment.completed and refund.approved from outbox only."
