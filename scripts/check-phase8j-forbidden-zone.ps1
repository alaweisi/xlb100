# Phase 8J gate: no forbidden terms in git diff (payout/paid_settlement/withdraw/refund/aftersale/notification/payment_instruction)
# Phase 10 exemption: governance code may reference forbidden terms in boundary/disabled/docs context
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenPatterns = @(
  '\bpayout\b',
  '\bpaid_settlement\b',
  '\bwithdraw\b',
  '\brefund\b',
  '\baftersale\b',
  '\bnotification\b',
  '\bpayment_instruction\b'
)

$phase10Allowed = @(
  'packages/types/src/settlementActionIntent.ts'
  'packages/validators/src/settlementActionIntentSchema.ts'
  'packages/validators/src/governanceIntentSchema.ts'
  'packages/validators/src/governanceReviewSchema.ts'
  'packages/validators/src/governanceEvidenceSchema.ts'
  'packages/validators/src/governanceReadinessSchema.ts'
  'docs/contracts/CONTRACT_SETTLEMENT_ACTION_INTENT.md'
)

$diff = & git -C $Root diff main...HEAD -- backend/src/ packages/ 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "check-phase8j-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
$lines = $diff -split "`n"
$currentFile = ""
foreach ($line in $lines) {
  if ($line -match '^diff --git') {
    $currentFile = $line -replace '^diff --git a/', '' -replace ' b/.*$', ''
  }
  if ($line -match '^\+(?!\+)') {
    if ($phase10Allowed -contains $currentFile) { continue }
    $content = $line.Substring(1)
    foreach ($pattern in $forbiddenPatterns) {
      if ($content -match $pattern) {
        $violations += "$currentFile + line: $($line.Trim())"
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

Write-Host "check-phase8j-forbidden-zone: passed (Phase 10 governance allowed)"
