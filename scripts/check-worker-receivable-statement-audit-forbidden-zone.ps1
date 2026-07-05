# Phase 8I gate: no forbidden terms in git diff
# Phase 10 exemption: governance docs and code may contain forbidden terms in boundary/disabled context
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot

$forbiddenPatterns = @(
  '\bpayout\b',
  '\bpaid_settlement\b',
  '\bwithdraw\b',
  'refund.*service',
  'aftersale.*service',
  'notification.*consumer',
  'payment_instruction'
)

# Phase 10 governance files allowed â€?forbidden terms appear only in disabled/boundary/docs context
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
  Write-Host "check-worker-receivable-statement-audit-forbidden-zone: FAILED - git diff failed (is main branch available?)"
  exit 1
}

$violations = @()
$lines = $diff -split "`n"
$currentFile = ""
foreach ($line in $lines) {
  if ($line -match '^diff --git') {
    # Extract the file path from diff --git a/PATH b/PATH
    $currentFile = $line -replace '^diff --git a/', '' -replace ' b/.*$', ''
  }
  if ($line -match '^\+(?!\+)') {
    # Skip allowed Phase 10 governance files
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
  Write-Host "check-worker-receivable-statement-audit-forbidden-zone: FAILED - forbidden terms found in diff"
  $violations | ForEach-Object { Write-Host "  $_" }
  exit 1
}

Write-Host "check-worker-receivable-statement-audit-forbidden-zone: passed (Phase 10 governance allowed)"
