# Phase 10 RC Third-Party Inspection Pack

**Project**: E:\xlb100
**Branch**: phase10-settlement-action-governance-release-train
**Base**: main@3e90f2b1bbfb4c7d7a08371e902fe8b3f8cbaa86
**Head**: 8da9432

## Objective
Verify Phase 10A-10F completed governance-only settlement action governance:
- No payout / payment execution / settlement mutation
- No ledger mutation / refund/reversal execution
- No export generation/download / no Phase 11 execution

## Required Checks

```powershell
cd E:\xlb100

# 1. Worktree clean
git status --short

# 2. No lock tag
git tag --points-at HEAD

# 3. Scope audit
git diff --name-only 3e90f2b...HEAD -- apps/customer apps/worker package.json pnpm-lock.yaml pnpm-workspace.yaml

# 4. Full diff
git diff --name-only 3e90f2b...HEAD

# 5. Typecheck
npx -y pnpm@9.15.0 typecheck

# 6. Phase 9 + Phase 10A-F tests
npx -y pnpm@9.15.0 test -- tests/unit/settlementOpsPage.test.tsx tests/unit/settlementStatementDetailPage.test.tsx tests/unit/settlementExportReviewPage.test.tsx tests/unit/settlementCrossLinkNavigation.test.tsx tests/unit/settlementQueryFilterPagination.test.tsx tests/unit/settlementActionGovernancePage.test.tsx tests/unit/settlementActionIntentSchema.test.ts tests/unit/governanceIntentSchema.test.ts tests/unit/governanceReviewSchema.test.ts tests/unit/governanceEvidenceSchema.test.ts tests/unit/governanceReadinessSchema.test.ts

# 7. Preflight
npx -y pnpm@9.15.0 preflight

# 8. Forbidden execution keywords audit
rg -n "execute_payout|pay_now|provider_withdrawal|execute_refund|reverse_ledger|generate_export|download_url|payout_batch_id|ledger_mutation_id|refund_execution_id|paid_at|executed_at" backend/db/packages/apps/admin/tests/docs --include="*.ts" --include="*.tsx" --include="*.sql" --include="*.md"

# 9. Governance routes audit
rg "registerGovernance" backend/src/app.ts

# 10. DB migrations audit
ls db/migrations/020*.sql db/migrations/021*.sql db/migrations/022*.sql db/migrations/023*.sql
```

## Expected PASS Criteria
- 236/236 tests (71 Phase 9 + 165 Phase 10)
- Typecheck 14/14
- Preflight ALL PHASES PASSED
- Zero customer/worker/dependency changes
- Zero execution endpoints
- All governance-only routes

## Verdict Format
- PASS / FAIL
- blocking findings
- non-blocking findings
- Phase 10 Lock may proceed: Yes/No
