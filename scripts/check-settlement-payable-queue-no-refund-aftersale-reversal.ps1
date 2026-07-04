$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/016_settlement_payable_queue.sql")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)refund|aftersale|reversal') { throw "Phase 8E must not implement refund, aftersale, or reversal." }
Write-Host "PASS: Phase 8E has no refund, aftersale, or reversal scope."
