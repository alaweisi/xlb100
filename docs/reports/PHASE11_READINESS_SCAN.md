# Phase 11 Readiness Scan — Settlement Execution Dry-run Planner

## Phase 11 Title
Phase 11 — Settlement Execution Dry-run Planner
结算执行干跑计划器

## Baseline
- **main HEAD**: baa6d54fa01414fe4b46933f4219ef9e045a43c2
- **Phase 10 tag**: xlb-phase10-settlement-action-governance
- **Phase 10 tag target**: 0c89a196ea4534bccd8a29aa377961032576a552
- **Phase 10 state**: LOCKED
- **CURRENT_STATE**: Phase 11 NOT STARTED → READY FOR READINESS SCAN

## Branch
phase11-settlement-execution-dry-run-planner

## Readiness Scope
- Dry-run planner only — no execution
- Independent planner tables (`settlement_execution_dry_run_plans`, `_items`, `_audit`)
- New backend module: `backend/src/planner/`
- No modification of Phase 10 governance tables
- Admin-only + city-scoped routes
- Read-only reference to existing settlement/ledger tables (SELECT only, no writes)

## Required Approval Gate
- `markReadyForFuturePhaseReview(ctx, packetId)` — backend/governance service method
- Must read-time SELECT + JOIN verify `review_status = 'approved_for_governance'`
- Must reject cross-city, pending, rejected, stale, or missing reviews
- Must populate `sourceRefs` from intent/review/evidence/audit references
- Fail closed on empty sourceRefs: READINESS_PACKET_SOURCE_REFS_REQUIRED

## Forbidden (Inherited From Phase 10 + New)

### Inherited From Phase 10
- No payout
- No provider withdrawal
- No payment execution
- No settlement result mutation
- No ledger result mutation
- No refund/reversal execution
- No export file generation/download
- No customer/worker app modifications
- No dependency changes

### New For Phase 11
- No real execution API (approve-governance only, no execute-payout/refund/ledger)
- No provider adapter call (no provider dispatch, no payment instruction)
- No dry-run money simulation (guard is metadata-only gateway)
- No Phase 12 execution (future phase not started)

## Readiness Verdict
- **GO for implementation** was granted only for dry-run planner
- **Not locked** — awaiting third-party inspection
- **Phase 11 Lock may proceed only after third-party inspection PASS**

## Agent Findings (from multi-agent readiness scan)
- **Agent A (Baseline)**: PASS — branch, tag, worktree, typecheck, preflight all verified
- **Agent B (Packet Contract)**: CONDITIONAL — sourceRefs gap identified; `markReadyForFuturePhaseReview` added
- **Agent C (Forbidden Execution)**: PASS — zero actual executable payout/refund/ledger paths
- **Agent D (Ledger/Reversal)**: PASS — real settlement write code exists but Phase 11 only reads
- **Agent E (Admin Surface)**: READY — new hash route + sub-view needed
- **Agent F (City Scope)**: PASS — planner queries use city-scoped patterns
- **Agent G (Test/Gate)**: READY — 8 new check scripts needed
- **Agent H (Synthesis)**: CONDITIONAL PASS with 3 conditions, all resolved in implementation

## Test Plan
- `tests/unit/plannerSchema.test.ts` — planner record schemas (~15 tests)
- `tests/security/plannerNoExecution.test.ts` — no forbidden service imports (~10 tests)
- `tests/security/plannerCityScope.test.ts` — city scope enforcement (~5 tests)
- `tests/contract/planner.contract.test.ts` — API contract shapes (~5 tests)

## Gate Plan
- `scripts/check-phase11-no-forbidden-imports.ps1`
- `scripts/check-phase11-no-execution-keywords.ps1`
- `scripts/check-phase11-dry-run-only.ps1`
- `scripts/check-phase11-readonly-planner.ps1`
- `scripts/check-phase11-city-scope.ps1`
- `scripts/check-phase11-no-migration-of-phase10-tables.ps1`
- `scripts/check-phase11-no-ui-execution-controls.ps1`
- `scripts/check-phase11-forbidden-zone.ps1`
- All wired into `scripts/preflight-architecture.ps1`

## Risk Matrix
| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Planner accidentally calls write service | Low | Critical | Phase 11 import gates + security tests |
| Cross-city data leak via planner | Low | High | City-scoped queries + cross-city gate |
| Planner bypasses governance approval | Low | Critical | Read-time DB verification of `approved_for_governance` |
| Empty sourceRefs packet passes | Low | Medium | Fail-closed error: READINESS_PACKET_SOURCE_REFS_REQUIRED |

## Decision
- **Phase 11 Readiness**: CONDITIONAL PASS → GO for dry-run planner implementation only
- **Phase 11 implementation completed**: pending third-party inspection
- **Third-party inspector**: Codex CLI / Claude Code / DeepSeek Agent
