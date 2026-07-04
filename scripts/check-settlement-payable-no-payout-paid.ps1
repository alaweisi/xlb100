$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$Files = @(Get-ChildItem (Join-Path $Root "backend/src/settlement") -Filter "*.ts")
$Files += Get-Item (Join-Path $Root "db/migrations/015_settlement_payable_readiness.sql")
$Files += Get-Item (Join-Path $Root "packages/types/src/settlement.ts")
$Files += Get-Item (Join-Path $Root "packages/validators/src/settlementSchema.ts")
$Text = ($Files | ForEach-Object { Get-Content -Raw $_.FullName }) -join "`n"
if ($Text -match '(?i)\bpayout\b|["'']paid["'']|paid_at|payout_status|payout_id|transfer_no') { throw "Phase 8D contains payout or paid settlement scope." }
Write-Host "PASS: Phase 8D has no payout or paid settlement implementation."
