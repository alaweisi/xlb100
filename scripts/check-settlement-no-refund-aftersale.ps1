$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts") + @(Get-Item (Join-Path $Root "db/migrations/013_settlement_preparation_foundation.sql"))
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)from\s+["''][^"'']*(refund|aftersale|reversal)|CREATE\s+TABLE\s+[^\s]*(refund|aftersale|reversal)') { throw "Phase 8B imports or creates a forbidden downstream domain." }
Write-Host "PASS: settlement preparation contains no refund, aftersale, or reversal implementation."
