$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)UPDATE\s+(orders|payment_orders|fulfillments|ledger_accruals)\b|ALTER\s+TABLE\s+(orders|payment_orders|fulfillments|ledger_accruals)\b') { throw "Settlement confirmation mutates upstream state." }
Write-Host "PASS: settlement confirmation leaves upstream state unchanged."
