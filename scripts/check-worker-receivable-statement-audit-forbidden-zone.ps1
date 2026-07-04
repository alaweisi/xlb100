# Phase 8I gate: no forbidden terms in git diff
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

# Terms that must NOT appear in any added/changed lines for Phase 8I (audit query only)
$forbiddenPatterns = @(
  '\bpayout\b',
  '\bpaid_settlement\b',
  '\bwithdraw\b',
  'refund.*service',
  'aftersale.*service',
  'notification.*consumer',
  'payment_instruction'
)

$diff = & git -C $Root diff main...HEAD -- backend/src/ packages/ 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-worker-receivable-statement-audit-forbidden-zone: FAILED - git diff failed (is main branch available?)"
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
  Write-Host "check-worker-receivable-statement-audit-forbidden-zone: FAILED - forbidden terms found in diff"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-forbidden-zone: passed"
