$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/013_settlement_preparation_foundation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)UPDATE\s+(orders|payment_orders|fulfillments|ledger_entries|ledger_accruals)\b|ALTER\s+TABLE\s+(orders|payment_orders|fulfillments|ledger_entries)\b') { throw "Settlement preparation mutates upstream state." }
Write-Host "PASS: settlement preparation does not mutate upstream state."
