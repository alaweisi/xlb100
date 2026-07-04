$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/013_settlement_preparation_foundation.sql")) + @(Get-Item (Join-Path $Root "packages/types/src/settlement.ts")) + @(Get-Item (Join-Path $Root "packages/validators/src/settlementSchema.ts"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)["'']paid["'']|paid_at|payout_status|transfer_no|provider_trade_no') { throw "Phase 8B contains a paid or provider-transfer state." }
Write-Host "PASS: Phase 8B settlement status is preparation-only."
