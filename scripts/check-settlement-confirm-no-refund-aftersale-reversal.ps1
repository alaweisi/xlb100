$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/014_settlement_confirmation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)from\s+["''][^"'']*(refund|aftersale|reversal)|CREATE\s+TABLE\s+[^\s]*(refund|aftersale|reversal)|\b(settlement|ledger)_reversal\b') { throw "Phase 8C imports or creates a forbidden downstream domain." }
Write-Host "PASS: Phase 8C has no refund, aftersale, or reversal implementation."
