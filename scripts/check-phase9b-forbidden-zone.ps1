$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$forbidden = @("payout", "paid", "payment_instruction", "provider", "notification", "sms", "push", "email", "refund", "aftersale", "reversal", "repair", "backfill", "auto-fix", "withdraw")
foreach ($term in $forbidden) { if ($diff -match "\b$term\b") { Write-Host "check-phase9b-forbidden-zone: FAILED — $term"; exit 1 } }
Write-Host "check-phase9b-forbidden-zone: passed"
