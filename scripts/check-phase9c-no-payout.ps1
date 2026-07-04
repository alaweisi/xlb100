$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$forbidden = @("payout", "paid_settlement", "payment_instruction", "withdraw")
foreach ($term in $forbidden) { if ($diff -match "\b$term\b") { Write-Host "check-phase9c-no-payout: FAILED — $term"; exit 1 } }
Write-Host "check-phase9c-no-payout: passed"
