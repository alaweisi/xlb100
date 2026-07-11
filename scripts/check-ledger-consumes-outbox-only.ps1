$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Consumer = Get-Content -Raw (Join-Path $Root "backend/src/ledger/ledgerOutboxConsumer.ts")
if ($Consumer -notmatch 'claimFulfillmentCompletedForLedger' -or
    $Consumer -notmatch 'claimEventsByType[\s\S]*?"refund\.approved"') {
  throw "Ledger consumer must atomically claim fulfillment.completed and refund.approved outbox events."
}
if ($Consumer -notmatch 'renewClaim' -or $Consumer -notmatch 'failClaim') {
  throw "Ledger consumer must use lease renewal and failure handling for claimed outbox events."
}
if ($Consumer -match 'order\.paid|payment\.paid|fulfillment\.started|refund\.requested') {
  throw "Ledger consumer may only consume fulfillment.completed and refund.approved."
}
Write-Host "PASS: ledger atomically claims fulfillment.completed and refund.approved from outbox only."
