$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$ScriptName = Split-Path -Leaf $PSCommandPath
$PhaseName = $ScriptName -replace '^check-', '' -replace '-forbidden-zone\.ps1$', ''
$forbiddenPatterns = @('\bpayout\b','\bpaid_settlement\b','\bwithdraw\b','\brefund\b','\baftersale\b','\bnotification\b','\bpayment_instruction\b')
$allowedFiles = @(
  'backend/src/support/bot/sensitiveSupportGuard.ts',
  "backend/src/governance/governanceGuard.ts",
  "backend/src/governance/governanceIntentRoutes.ts",
  "backend/src/governance/governanceIntentService.ts",
  "backend/src/governance/governanceReviewRoutes.ts",
  "backend/src/governance/governanceReviewService.ts",
  "backend/src/governance/governanceEvidenceRoutes.ts",
  "backend/src/governance/governanceEvidenceService.ts",
  "backend/src/governance/governanceReadinessRoutes.ts",
  "backend/src/governance/governanceReadinessService.ts",
  "backend/src/planner/plannerRoutes.ts",
  "backend/src/planner/plannerService.ts",
  "backend/src/planner/plannerPlanBuilder.ts",
  "backend/src/preparation/envelopeService.ts",
  "backend/src/preparation/envelopeRoutes.ts",
  "db/migrations/020_settlement_action_governance_intents.sql",
  "db/migrations/025_settlement_execution_dry_run_plans.sql",
  "db/migrations/026_settlement_execution_preparation_envelope.sql",
  "docs/contracts/CONTRACT_SETTLEMENT_ACTION_INTENT.md",
  "docs/contracts/CONTRACT_SETTLEMENT_BATCH.md",
  "docs/contracts/CONTRACT_SETTLEMENT_CONFIRMATION.md",
  "docs/contracts/CONTRACT_SETTLEMENT_ITEM.md",
  "docs/contracts/CONTRACT_SETTLEMENT_PAYABLE_QUEUE.md",
  "docs/contracts/CONTRACT_SETTLEMENT_PAYABLE_READINESS.md",
  "docs/contracts/CONTRACT_SETTLEMENT_PREPARATION.md",
  "docs/reports/PHASE10_RC_INSPECTION_PACK.md",
  "docs/reports/PHASE11_FINAL_LOCK_REPORT.md",
  "docs/reports/PHASE11_IMPLEMENTATION_REPORT.md",
  "docs/reports/PHASE11_READINESS_SCAN.md",
  "docs/reports/PHASE12_READINESS_SCAN.md",
  "docs/reports/PHASE12_REWORK_PLAN.md",
  "docs/reports/PHASE12_REWORK_V2_PLAN.md",
  "packages/api-client/src/governanceEvidence.ts",
  "packages/api-client/src/governanceIntent.ts",
  "packages/api-client/src/governancePlanner.ts",
  "packages/api-client/src/governanceReadiness.ts",
  "packages/api-client/src/governanceReview.ts",
  "packages/types/src/governanceEvidence.ts",
  "packages/types/src/governanceIntent.ts",
  "packages/types/src/governanceReadiness.ts",
  "packages/types/src/governanceReview.ts",
  "packages/types/src/preparation.ts",
  "packages/types/src/settlementActionIntent.ts",
  "packages/validators/src/governanceEvidenceSchema.ts",
  "packages/validators/src/governanceIntentSchema.ts",
  "packages/validators/src/governanceReadinessSchema.ts",
  "packages/validators/src/governanceReviewSchema.ts",
  "packages/validators/src/preparationSchema.ts",
  "packages/validators/src/settlementActionIntentSchema.ts",
  "tests/contract/planner.contract.test.ts",
  "tests/contract/preparation.contract.test.ts",
  "tests/security/plannerCityScope.test.ts",
  "tests/security/plannerNoExecution.test.ts",
  "tests/security/preparationCityScope.test.ts",
  "tests/security/preparationNoExecution.test.ts",
  "tests/unit/governanceEvidenceSchema.test.ts",
  "tests/unit/governanceIntentSchema.test.ts",
  "tests/unit/governanceReadinessSchema.test.ts",
  "tests/unit/governanceReviewSchema.test.ts",
  "tests/unit/plannerSchema.test.ts",
  "tests/unit/preparationSchema.test.ts",
  "tests/unit/settlementActionIntentSchema.test.ts",
  "backend/src/aftersale/aftersaleModule.ts",
  "backend/src/aftersale/refund/refundRepository.ts",
  "backend/src/aftersale/refund/refundRoutes.ts",
  "backend/src/aftersale/refund/refundService.ts",
  "backend/src/app.ts",
  "backend/src/events/refundEvents.ts",
  "backend/src/ledger/ledgerOutboxConsumer.ts",
  "backend/src/ledger/ledgerReversalRepository.ts",
  "backend/src/ledger/ledgerReversalService.ts",
  "backend/src/ledger/ledgerRoutes.ts",
  "backend/src/ledger/ledgerService.ts",
  "backend/src/ledger/replay/replayValidator.ts",
  "packages/types/src/eventOutbox.ts",
  "packages/types/src/index.ts",
  "packages/types/src/ledger.ts",
  "packages/types/src/refund.ts",
  "packages/validators/src/eventOutboxSchema.ts",
  "packages/validators/src/index.ts",
  "packages/validators/src/ledgerSchema.ts",
  "packages/validators/src/refundSchema.ts",
  "backend/src/support/ticket/supportTicketService.ts",
  "packages/validators/src/supportSchema.ts"
)
$diff = & git -C $Root diff main...HEAD -- backend/src/ packages/ 2>$null
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED - git diff"; exit 1 }
$violations = @(); $lines = $diff -split "`n"; $currentFile = ""
foreach ($line in $lines) {
  if ($line -match '^diff --git') { $currentFile = (($line -replace '^diff --git a/', '') -replace ' b/.*$', '').Trim() }
  if ($line -match '^\+(?!\+)') {
    if ($allowedFiles -contains $currentFile) { continue }
    $content = $line.Substring(1)
    foreach ($pattern in $forbiddenPatterns) { if ($content -match $pattern) { $violations += "$($currentFile): $($line.Trim())"; break } }
  }
}
if ($violations.Count -gt 0) { Write-Host "FAILED - forbidden terms"; $violations | ForEach-Object { Write-Host "  $_" }; exit 1 }
Write-Host "check-${PhaseName}-forbidden-zone: passed (exact allowlist with Phase 14R refund reversal)"

