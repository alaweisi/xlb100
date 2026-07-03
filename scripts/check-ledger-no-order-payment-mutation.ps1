$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = Get-ChildItem (Join-Path $Root "backend/src/ledger") -Filter "*.ts"
$Matches = $Files | Select-String -Pattern 'UPDATE\s+(orders|payment_orders|fulfillments)' -CaseSensitive:$false
if ($Matches) { $Matches | ForEach-Object { Write-Host $_ }; throw "Ledger must not mutate order, payment, or fulfillment state." }
$Migration = Get-Content -Raw (Join-Path $Root "db/migrations/012_ledger_accrual_foundation.sql")
if ($Migration -match 'CREATE\s+TABLE\s+(settlement|payout|refund|aftersale)') { throw "Phase 8A migration contains a forbidden table." }
Write-Host "PASS: ledger does not mutate upstream state or create downstream tables."
