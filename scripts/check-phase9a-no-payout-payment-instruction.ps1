$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Exclude scripts/ and tests/ from diff search — those contain gate/test code, not production code
$diff = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' 2>$null
$forbidden = @("payout", "paid_settlement", "payment_instruction", "provider.*call", "notification.*consumer", "withdraw")
foreach ($term in $forbidden) {
  if ($diff -match $term) {
    Write-Host "check-phase9a-no-payout-payment-instruction: FAILED — $term"; exit 1
  }
}
Write-Host "check-phase9a-no-payout-payment-instruction: passed"
