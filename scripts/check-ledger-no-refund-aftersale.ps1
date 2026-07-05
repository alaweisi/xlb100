$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend/src/ledger") -Filter "*.ts"
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '\.\./aftersale|from\s+["''][^"'']*aftersale') {
  throw "Ledger must not import aftersale modules directly."
}
if ($Text -match 'UPDATE\s+(orders|payment_orders|fulfillments)|DELETE\s+FROM\s+(orders|payment_orders|fulfillments)') {
  throw "Ledger reversal must not mutate upstream order, payment, or fulfillment state."
}
if ($Text -notmatch 'refund\.approved' -or $Text -notmatch '/api/internal/ledger/reverse') {
  throw "Ledger reversal must be exposed only through refund.approved outbox consumption and the internal reverse runner."
}
Write-Host "PASS: ledger refund reversal is outbox-driven and does not import aftersale or mutate upstream state."
