$ErrorActionPreference = "Stop"; $Root = Split-Path -Parent $PSScriptRoot
# Phase 10+11+12 governance/planner/preparation files: exact allowlist
$d = & git -C $Root diff main...HEAD -- . ':!scripts/' ':!tests/' ':!docs/release/' 2>$null
$fb = @("payout", "paid_settlement", "payment_instruction", "provider.*call", "notification.*consumer", "withdraw")
$allowedFiles = @(
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
  "tests/unit/settlementActionIntentSchema.test.ts"
)
$lines = $d -split "`n"; $cf = ""; $vs = @()
foreach ($l in $lines) {
  if ($l -match '^diff --git') { $cf = ($l -replace '^diff --git a/', '') -replace ' b/.*$', '' }
  if ($l -match '^\+(?!\+)') {
    if ($allowedFiles -contains $cf) { continue }
    foreach ($t in $fb) { if ($l -match $t) { $vs += "$($cf): $($l.Trim())"; break } }
  }
}
if ($vs) { Write-Host "check-phase9b-no-payout-payment-instruction: FAILED"; exit 1 }
Write-Host "check-phase9b-no-payout-payment-instruction: passed (exact allowlist)"
