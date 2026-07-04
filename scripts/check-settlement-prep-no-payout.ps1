$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/013_settlement_preparation_foundation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)\b(payout|withdrawal)\b|transfer_no|provider_trade_no|CREATE\s+TABLE\s+(payouts|withdrawals)') { throw "Phase 8B settlement preparation contains money-transfer scope." }
Write-Host "PASS: settlement preparation contains no payout or withdrawal implementation."
