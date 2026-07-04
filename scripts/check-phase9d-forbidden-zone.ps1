$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$terms = @("payout","paid_settlement","payment_instruction","provider","notification","refund","reversal","export-once","repair","backfill")
foreach ($t in $terms) { if ($diff -match "\b$t\b") { Write-Host "check-phase9d-forbidden-zone: FAILED — $t"; exit 1 } }
Write-Host "check-phase9d-forbidden-zone: passed"
