$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$terms = @("payout","paid","payment_instruction","provider","notification","refund","reversal","export-once","repair")
foreach ($t in $terms) { if ($diff -match "\b$t\b") { Write-Host "check-phase9e-forbidden-zone: FAILED — $t"; exit 1 } }
Write-Host "check-phase9e-forbidden-zone: passed"
