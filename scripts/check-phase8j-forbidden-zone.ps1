# Phase 8J gate: no forbidden terms in git diff (payout/paid_settlement/withdraw/refund/aftersale/notification/payment_instruction)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# Terms that must NOT appear in any added/changed lines for Phase 8J (review summary query only)
$forbiddenPatterns = @(
  '\bpayout\b',
  '\bpaid_settlement\b',
  '\bwithdraw\b',
  '\brefund\b',
  '\baftersale\b',
  '\bnotification\b',
  '\bpayment_instruction\b'
)

$diff = & git -C $Root diff main...HEAD -- backend/src/ packages/ 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase8j-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

# Only check added lines (those starting with +) - skip the diff hunk headers
$violations = @()
$lines = $diff -split "`n"
$lineNum = 0
foreach ($line in $lines) {
  $lineNum++
  # Only inspect added lines (prefixed with +, but not +++ which is the file header)
  if ($line -match '^\+(?!\+)') {
    $content = $line.Substring(1)  # Strip the leading +
    foreach ($pattern in $forbiddenPatterns) {
      if ($content -match $pattern) {
        $violations += "line $lineNum`: $($line.Trim())"
        break
      }
    }
  }
}

if ($violations.Count -gt 0) {
  Write-Host "check-phase8j-forbidden-zone: FAILED - forbidden terms found in diff"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-phase8j-forbidden-zone: passed"
