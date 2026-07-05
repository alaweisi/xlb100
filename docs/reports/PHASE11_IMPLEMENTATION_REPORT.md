# Phase 11 Implementation Report — Settlement Execution Dry-run Planner

## Branch / HEAD
- **Branch**: phase11-settlement-execution-dry-run-planner
- **HEAD (pre-repair)**: b7e1f23
- **HEAD (post-repair)**: 8f85602d222415ffb98b540ef7698fe73f29d89f
- **Stable base**: main@baa6d54fa01414fe4b46933f4219ef9e045a43c2

## Changed Files Summary
| Category | Files |
|----------|-------|
| **Backend — governance** | `backend/src/governance/governanceReadinessService.ts` — added `markReadyForFuturePhaseReview` |
| **Backend — governance** | `backend/src/governance/governanceReadinessRoutes.ts` — added POST route |
| **Backend — planner** | `backend/src/planner/plannerPlanBuilder.ts` — deterministic plan builder |
| **Backend — planner** | `backend/src/planner/plannerService.ts` — city-scoped service |
| **Backend — planner** | `backend/src/planner/plannerRoutes.ts` — admin-only routes |
| **Backend — app** | `backend/src/app.ts` — registered planner routes |
| **DB** | `db/migrations/025_settlement_execution_dry_run_plans.sql` — 3 tables |
| **Packages — types** | `packages/types/src/governanceReadiness.ts` — added `ready_for_future_phase_review` status |
| **Packages — validators** | `packages/validators/src/governanceReadinessSchema.ts` — added status |
| **Packages — API client** | `packages/api-client/src/governancePlanner.ts` — 6 planner methods |
| **Packages — API client** | `packages/api-client/src/index.ts` — barrel export |
| **Admin UI** | `apps/admin/src/pages/SettlementActionGovernancePage.tsx` — Phase 11 sub-view |
| **Admin UI** | `apps/admin/src/hashParams.ts` — added `subView` param |
| **Admin UI** | `apps/admin/src/app/App.tsx` — route for sub-view |
| **Tests** | 4 new test files (planner schema, no-execution, city-scope, contract) |
| **Gates** | 8 new `check-phase11-*.ps1` scripts + preflight wiring |
| **Reports** | PHASE11_READINESS_SCAN.md, PHASE11_IMPLEMENTATION_REPORT.md |

## Planner Architecture

### backend/src/planner/
- **plannerPlanBuilder.ts** — deterministic SHA256 plan hash, idempotency by packet_id, city-scoped reads (SELECT only on non-planner tables), writes only to `settlement_execution_dry_run_*` tables
- **plannerService.ts** — wraps `PlannerPlanBuilder`, enforces `assertCityScopedContext`, verifies approval gate + sourceRefs before plan generation
- **plannerRoutes.ts** — 6 admin-only routes (POST create plan, GET list/read/items/audit), all guarded by `requireGovernanceAdmin` + `createRequestContextMiddleware({ requireCityCode: true })`

### DB: db/migrations/025_settlement_execution_dry_run_plans.sql
- 3 independent planner tables: `settlement_execution_dry_run_plans`, `settlement_execution_dry_run_plan_items`, `settlement_execution_dry_run_plan_audit`
- All tables include `city_code` (FK to cities, CHECK <> '__global__')
- NO ALTER on Phase 8/9/10 tables
- NO execution columns (no `paid_at`, `executed_at`, `payout_batch_id`, `payment_execution_id`, `ledger_mutation_id`, `refund_execution_id`, etc.)
- FK to `settlement_action_governance_readiness_packets` (Phase 10 table — read-only reference)

## Approval Gate

### markReadyForFuturePhaseReview
- **Location**: `backend/src/governance/governanceReadinessService.ts`
- **Guards**: admin-only (`requireGovernanceAdmin`) + city-scoped (`assertCityScopedContext`)
- **Verification flow**:
  1. Load packet through governance city isolation path
  2. Load linked governance review via JOIN
  3. Verify `review_status = 'approved_for_governance'`
  4. Verify `review.city_code` matches context city (cross-city rejection)
  5. Verify `review.reviewed_at` exists (stale rejection)
  6. Populate `sourceRefs` from intent/review/evidence/audit references
  7. Fail closed on empty `sourceRefs`: `READINESS_PACKET_SOURCE_REFS_REQUIRED`
  8. Transition packet to `ready_for_future_phase_review`
- **No execution**: method only reads governance tables, no import of payment/ledger/refund/reversal write services

## API Client
- **packages/api-client/src/governancePlanner.ts** — 6 methods:
  - `listSettlementDryRunPlans(params?)`
  - `getSettlementDryRunPlan(planId)`
  - `createSettlementDryRunPlan(packetId)`
  - `getSettlementDryRunPlanItems(planId)`
  - `getSettlementDryRunPlanAudit(planId)`
  - `getReadinessPacketDryRunEligibility(packetId)`
- Exported from `packages/api-client/src/index.ts` as `governancePlannerApi`
- No customer/worker API changes

## Admin UI
- **Phase 11 sub-view** added to `SettlementActionGovernancePage.tsx`
- Navigation via hash param `sub=plans`
- "View Dry-run Plans" button navigates to sub-view
- "Generate Dry-run Plan" button calls `createSettlementDryRunPlan` API
- All UI read-only — no execute/payout/refund/download/export buttons
- Governance Only / Execution Disabled banners preserved

## Tests / Gates

### Gate Results
| Gate | Result |
|------|--------|
| pnpm typecheck | 14/14 PASS |
| pnpm preflight (Phase 0–9E + Phase 11) | ALL PASSED |
| Phase 11 — no-forbidden-imports | PASSED |
| Phase 11 — no-execution-keywords | PASSED |
| Phase 11 — dry-run-only | PASSED |
| Phase 11 — readonly-planner | PASSED |
| Phase 11 — city-scope | PASSED |
| Phase 11 — no-migration-phase10-tables | PASSED |
| Phase 11 — no-ui-execution-controls | PASSED |
| Phase 11 — forbidden-zone | PASSED |

### Test Files
| File | Tests | Purpose |
|------|-------|---------|
| tests/unit/plannerSchema.test.ts | ~15 | Validate planner record schemas |
| tests/security/plannerNoExecution.test.ts | ~13 | Verify no forbidden service imports |
| tests/security/plannerCityScope.test.ts | ~7 | City scope enforcement |
| tests/contract/planner.contract.test.ts | ~5 | API contract shape validation |

## Forbidden Execution Audit
- ✅ No payout code in planner
- ✅ No provider withdrawal code in planner
- ✅ No payment execution code in planner
- ✅ No settlement result mutation in planner
- ✅ No ledger mutation in planner
- ✅ No refund/reversal execution in planner
- ✅ No export file generation/download in planner
- ✅ No Phase 12 execution path
- ✅ All execution keywords appear only in boundary-doc/rejection-test/disabled-UI context
- ✅ Planner writes only to `settlement_execution_dry_run_*` tables
- ✅ Planner only SELECTs on non-planner tables
- ✅ No Phase 10 table ALTER in migration 025

## Third-party Inspection

### Claude Code First Phase 11 Inspection
- **Verdict**: FAIL
- **Blocking findings**:
  1. Phase 9 regression: 2 test files mock `@xlb/api-client` without `governancePlannerApi`
  2. No Phase 11 reports (zero `docs/reports/PHASE11_*.md`)
- **PASS findings** (verified and preserved):
  - Planner isolated in `backend/src/planner/`
  - Independent planner tables
  - No Phase 10 table mutation
  - No settlement/payment/ledger/refund/reversal write service imports
  - Admin-only + city-scoped planner routes
  - `markReadyForFuturePhaseReview` read-time DB verification of approval
  - Preflight PASS
  - Phase 11 8 gates PASS
  - Forbidden execution audit PASS

### Repair R1
- Fixed 2 Phase 9 test mocks (`settlementExportReviewPage.test.tsx`, `settlementStatementDetailPage.test.tsx`)
- Created PHASE11_READINESS_SCAN.md and PHASE11_IMPLEMENTATION_REPORT.md
- No planner code, DB, backend service, or gate changes

## Status
- **NOT LOCKED**
- No tag created
- No merge to main completed
- **Awaiting third-party reinspection** after Repair R1
