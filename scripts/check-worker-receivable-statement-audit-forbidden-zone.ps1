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

$allowedFiles = @(
  'packages/types/src/settlementActionIntent.ts',
  'packages/validators/src/settlementActionIntentSchema.ts',
  'packages/validators/src/governanceIntentSchema.ts',
  'packages/validators/src/governanceReviewSchema.ts',
  'packages/validators/src/governanceEvidenceSchema.ts',
  'packages/validators/src/governanceReadinessSchema.ts',
  'docs/contracts/CONTRACT_SETTLEMENT_ACTION_INTENT.md',
  'backend/src/aftersale/aftersaleModule.ts',
  'backend/src/aftersale/refund/refundRepository.ts',
  'backend/src/aftersale/refund/refundRoutes.ts',
  'backend/src/aftersale/refund/refundService.ts',
  'backend/src/app.ts',
  'backend/src/events/refundEvents.ts',
  'backend/src/ledger/ledgerOutboxConsumer.ts',
  'backend/src/ledger/ledgerReversalRepository.ts',
  'backend/src/ledger/ledgerReversalService.ts',
  'backend/src/ledger/ledgerRoutes.ts',
  'backend/src/ledger/ledgerService.ts',
  'backend/src/ledger/replay/replayValidator.ts',
  'packages/types/src/eventOutbox.ts',
  'packages/types/src/index.ts',
  'packages/types/src/ledger.ts',
  'packages/types/src/refund.ts',
  'packages/validators/src/eventOutboxSchema.ts',
  'packages/validators/src/index.ts',
  'packages/validators/src/ledgerSchema.ts',
  'packages/validators/src/refundSchema.ts'
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
    $currentFile = (($line -replace '^diff --git a/', '') -replace ' b/.*$', '').Trim()
  }
  if ($line -match '^\+(?!\+)') {
    if ($allowedFiles -contains $currentFile) { continue }
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

Write-Host "check-worker-receivable-statement-audit-forbidden-zone: passed (Phase 10 governance and Phase 14R refund reversal allowed)"

