# Phase 12 Readiness Scan — Settlement Execution Preparation Control Envelope

> **Readiness only. Not implementation. Not locked.**
> Third-party flight inspection: Claude/Codex — CONDITIONAL PASS WITH REQUIRED CORRECTIONS
> Corrections applied: B1–B7 (see Revision History)

## 1. Executive Summary

Phase 12 "Settlement Execution Preparation Control Envelope" is assessed as **CONDITIONAL PASS WITH REQUIRED CORRECTIONS**. It can safely proceed as preparation metadata / control envelope only, but requires the 7 blocking corrections documented below before implementation starts.

Phase 12 introduces no money movement, no execution, and no mutation of any existing settlement/ledger/refund table. It bridges Phase 10 governance readiness packets and Phase 11 dry-run plans into an immutable, frozen "envelope" with admin review workflow, deterministic hash-lock idempotency, read-only conflict checks, and full audit trail.

**Execution risk: Low.** Phase 11 planner has proven safe SELECT from settlement/ledger tables without calling any write service. Phase 12 follows the same pattern.

**Architecture risk: Moderate.** Several foundational capabilities are missing (refund/reversal/wallet/provider), limiting conflict-check scope. Settlement lacks a terminal state.

## 2. Baseline Verification — PASS

| Check | Status | Evidence |
|-------|--------|---------|
| Branch = main | ✅ | git branch |
| HEAD = a3d4fcb | ✅ | git log |
| Worktree clean | ✅ | git status |
| Phase 11 tag deref → cc45a23 | ✅ | git show-ref |
| Phase 10 tag deref → 0c89a19 | ✅ | git show-ref |
| CURRENT_STATE: Phase 11 LOCKED, Phase 12 NOT STARTED | ✅ | docs/CURRENT_STATE.md |
| Typecheck 14/14 | ✅ | PHASE11_FINAL_LOCK_REPORT.md |
| Preflight all phases | ✅ | PHASE11_FINAL_LOCK_REPORT.md |
| No tag movement needed | ✅ | docs-only commit after tag |

## 3. Phase 11 Artifact Inventory

| Artifact | Description |
|----------|-------------|
| `backend/src/planner/plannerPlanBuilder.ts` (557 lines) | Core builder. Deterministic SHA-256 hash. Reads: SELECT only from governance/settlement/ledger tables. Writes: only 3 Phase 11 tables. Transactional. Idempotent — SELECT checks existing plan_hash. |
| `backend/src/planner/plannerService.ts` (47 lines) | Thin wrapper. All methods call `assertCityScopedContext()`. Comment explicitly states "does NOT import any write service from settlement/payment/ledger/refund/reversal." |
| `backend/src/planner/plannerRoutes.ts` (112 lines) | 5 routes — all `requireGovernanceAdmin` + `createRequestContextMiddleware({requireCityCode:true})`. |
| `db/migrations/025` (3 tables) | `settlement_execution_dry_run_plans`, `_items`, `_audit`. All `city_code FK` + `CHECK <> '__global__'`. **Zero execution columns** (no paid_at/executed_at etc.). |
| `governanceReadinessService.markReadyForFuturePhaseReview` | Read-time DB verify `review_status='approved_for_governance'` + cross-city guard. |
| **Zero imports from payment/ledger/refund/reversal modules** | Verified — planner imports: `node:crypto`, `mysql2`, `@xlb/types`, `scopedExecutor`, `mysqlPool`, `governanceGuard`. |

## 4. Proposed Phase 12 Boundary (Corrected)

### 4.1 Candidate Scope

- Immutable envelope freezing (lock a packet once approved and ready into deterministic hash state)
- City-scoped, admin-only preparation review workflow
- Human approval gate: draft → frozen → **approved_for_phase13_review**
- Read-only conflict checks for future Phase 13 execution
- Full audit trail for all preparation actions
- **No money movement**

### 4.2 New Artifacts Architecture Sketch

| Layer | Artifact | Pattern |
|-------|----------|---------|
| DB | `settlement_execution_preparation_envelopes` + `_items` + `_audit` | Follow Phase 11 planner table pattern (city_code FK, CHECK, no execution columns) |
| Backend | `backend/src/preparation/` — envelopeService, envelopeRoutes | Admin-only + city-scoped, modeled on `plannerService` + `governanceGuard` |
| Routes | GET /preparation-envelopes, POST /freeze, POST /approve, GET /audit | RESTful, GET-heavy, admin-guarded |
| UI | Admin-only read-only summary + freeze/approve buttons | Governance-only mode, no execute/payout/refund/download/export buttons |
| Gate scripts | 9 new `check-phase12-*.ps1` | Follow Phase 11 gate pattern: no-forbidden-imports, no-execution-keywords, dry-run-only, city-scope, etc. |
| Tests | 9 new test files | Schema, no-execution, city-scope, immutability, approval gate read-time verify, freeze, conflict, idempotency, contract |

### 4.3 Status Flow (B1 — CORRECTED)

Phase 12 status values must NOT contain "execution":

```
draft → frozen → approved_for_phase13_review
```

Forbidden status values for Phase 12:
- `approved_for_execution` — REJECTED (implies execution capability)
- `executing`, `executed`, `paid`, `refunded`, `reversed`, `settled`, `exported`, `downloaded`, `generated`

## 5. Allowed Future Phase 12 Scope

- Independent preparation envelope tables (write only to `settlement_execution_preparation_*`)
- Freeze operation: write-once, immutable, deterministic hash-locked
- Human approval gate (status transition: draft → frozen → approved_for_phase13_review)
- Read-only conflict checks from settlement/ledger tables (SELECT with city_code = ?)
- Audit trail table modeled on existing planner patterns
- Admin-only, city-scoped routes guarded by `requireGovernanceAdmin` + `assertCityScopedContext`
- Admin-only UI for read-only preparation status (no execution buttons)

## 6. Explicitly Forbidden Scope

- Calling payment write services (paymentOrderService, paymentOrderRepository INSERT/UPDATE)
- Calling provider execution adapters (providers/ directory is empty — must not create write paths)
- Calling ledger write services (ledgerAccrualService.accrue, ledgerRepository INSERT)
- Calling settlement write services (settlementConfirmationService, settlementPayableService, etc.)
- Calling refund/reversal write services (placeholders — must not create write paths)
- Calling export write services (exportWorkerReceivableStatementOnce exists — must not call)
- Any INSERT/UPDATE/DELETE on settlement/ledger/payment tables
- Any INSERT/UPDATE/DELETE on Phase 10 governance tables (`settlement_action_governance_*`) (B2)
- Any INSERT/UPDATE/DELETE on Phase 11 planner tables (`settlement_execution_dry_run_*`) (B2)
- Queries without `city_code = ?` at the application level
- Global `__global__` sentinel (CHECK constraint prevents)
- Customer/worker app changes
- package.json / pnpm-lock changes
- Setting `executionEnabled: true` or `mutationEnabled: true`
- ALTER on Phase 11 planner audit table (B3)

## 7. Phase 12 Table Write Boundary (B2 — CORRECTED)

Phase 12 may write ONLY to:
- `settlement_execution_preparation_envelopes`
- `settlement_execution_preparation_items`
- `settlement_execution_preparation_audit`

Phase 12 may SELECT from Phase 10/11 tables only.

Phase 12 must NOT INSERT/UPDATE/DELETE on:
- `settlement_action_governance_*` (Phase 10 governance tables)
- `settlement_execution_dry_run_*` (Phase 11 planner tables)
- settlement/payment/ledger/refund/reversal/export tables

This is stricter than Phase 11 gate pattern which allowed `settlement_action_governance_*` writes. Phase 12 is a consumer-only of Phase 10/11 data.

## 8. trace_id Boundary (B3 — CORRECTED)

- New Phase 12 `settlement_execution_preparation_audit` may include `trace_id VARCHAR(64) NULL`.
- Phase 12 must NOT ALTER Phase 11 planner audit table.
- Phase 11 audit `trace_id` gap is a known non-blocking issue. Any Phase 11 trace_id repair requires a separate Phase 11.1 hardening branch with explicit Claude/Codex approval before implementation.

## 9. verifyReviewApproved City Scope Hardening (B4 — CORRECTED)

**Blocking pre-implementation hardening item.** Do NOT implement in readiness scan correction.

`verifyReviewApproved` in `plannerPlanBuilder.ts` currently queries without `city_code`:

```sql
SELECT review_status FROM settlement_action_governance_reviews WHERE id = ?
```

Must become city-scoped before Phase 12 implementation starts:

```sql
SELECT review_status FROM settlement_action_governance_reviews WHERE id = ? AND city_code = ?
```

This is a blocking pre-Phase-12 hardening item. Actual code fix must be done in a separate Phase 11.1 hardening branch or explicitly approved pre-Phase-12 repair — not in this readiness scan correction commit.

## 10. Freeze Immutability Semantics (B5 — CORRECTED)

Frozen payload is immutable. Status transitions are append-only and audit-logged.

**Immutable after freeze:**
- `payload_hash` — deterministic SHA-256 of envelope contents
- `item_hash` — deterministic SHA-256 of envelope items
- `source_packet_hash` — linked Phase 10 readiness packet hash
- `amount_snapshot` — settlement amounts at freeze time
- `city_config_snapshot` — CityConfig frozen at freeze time
- `settlement_cycle_snapshot` — settlement cycle state at freeze time
- `conflict_check_snapshot` — conflict check results at freeze time

**Status may only move:**
```
draft → frozen → approved_for_phase13_review
```

No reversal. No unfreeze. No re-freeze after approval. No status skip.

## 11. City Scope (B6 — CORRECTED)

**Mandatory Phase 12 rules:**

- All preparation SQL must include `WHERE city_code = ?` or use `buildCityScopedWhere()`.
- Post-insert reread queries must also be city-scoped.
- Service-level city scope enforcement via `assertCityScopedContext()` is mandatory.
- Route/header guard (`createRequestContextMiddleware`) alone is insufficient.
- No cross-city JOIN without city_code filter on each table.
- Cross-city envelope access must be rejected.

## 12. Provider/Payment Boundary (B7 — CORRECTED)

**Zero imports from:**
- `backend/src/providers/` — entire directory is empty placeholder
- `backend/src/payment/` — paymentOrderService, paymentOrderRepository
- `backend/src/ledger/` — ledgerAccrualService
- `backend/src/settlement/` — settlementConfirmationService, settlementPayableService, etc.
- `backend/src/refund/` — placeholder only
- `backend/src/reversal/` — placeholder only
- Any providerService, paymentOrderService, refundService, reversalService, ledgerMutationService

**Also forbidden:**
- No external API calls
- No provider dispatch
- No payout
- No ledger mutation
- No settlement mutation
- No refund/reversal execution
- No export generation/download
- No customer/worker app changes
- No package.json or pnpm-lock changes

## 13. Financial Boundary Risk Matrix

| Domain | Write Capability Exists | Phase 11 Planner Imports | Phase 12 Risk | Mitigation |
|--------|------------------------|--------------------------|---------------|------------|
| Payment writes | ✅ Exists (paymentOrderRepository INSERT/UPDATE) | ❌ Not imported | High — would execute real payments if called | Phase 12 gate check forbids imports |
| Ledger writes | ✅ Exists (ledgerAccrualService.accrue) | ❌ Not imported | High — would materialize real accruals | Phase 12 gate check forbids imports |
| Settlement writes | ✅ Exists (confirm/payable/queue/statement) | ❌ Not imported | High — would commit real batches | Phase 12 gate check forbids imports |
| Provider payout | ❌ No code | ❌ | Low — but Phase 12 must not create provider directory | Phase 12 gate checks provider/dispatch patterns |
| Refund | ❌ Placeholder only | ❌ | Low — conflict checks return zero rows | Gate scripts verify SELECT syntax valid + city-scoped |
| Reversal | ❌ Placeholder only | ❌ | Low — conflict checks return zero rows | Gate scripts verify SELECT syntax valid + city-scoped |
| Wallet | ❌ No code | ❌ | Low — no wallet system | N/A |
| Export generation | ⚠️ Metadata-only (no file writes) | ❌ Not imported | Medium — Phase 12 must not add file I/O | Phase 12 gate checks file generation patterns |
| Redis execution stream | ❌ Does not exist | ❌ | Low — execution stream does not exist | N/A |

## 14. City Scope / RLS Risk Matrix

| Gap | Severity | Impact | Mitigation |
|-----|----------|--------|------------|
| verifyReviewApproved missing city_code filter | Medium | Review already scoped by parent query; theoretical risk if review ID data corruption | B4 — **blocking pre-implementation hardening** |
| Audit table missing trace_id column | Low | Audit events cannot correlate to original HTTP request trace | B3 — Phase 12 audit may include trace_id; Phase 11 repair requires separate branch |
| Post-insert reread omits city_code | Low | ID is random UUID just inserted under correct cityCode; negligible practical risk | Add `AND city_code = ?` for defense-in-depth |
| Route guard header-based, not DB-verified | Medium | Spoofed admin header might pass route guard | Rely on service-level city scope enforcement (assertCityScopedContext) |

## 15. Refund / Reversal Conflict Matrix

| Check | Exists? | Phase 12 Risk | Required Phase 12 Guardrail |
|-------|---------|---------------|----------------------------|
| Refund execution code | ❌ Placeholder type only | Conflict checks return zero rows | Read-time verify: SELECT syntax valid, city-scoped, handle zero rows gracefully |
| Reversal execution code | ❌ No code | Same as refund | Same as refund |
| Ledger void transition | ❌ Dead schema (exists but never used) | `LedgerAccrualStatus = "voided"` is dead code | If Phase 12 enables void: must implement state machine first |
| Settlement closed/finalized state | ❌ No terminal state | Batches could change after statement creation | Phase 12 envelope freeze captures batch snapshot; Phase 13 executes against frozen snapshot |
| Worker amount field mutability | ⚠️ Written-once but no DB trigger guard | Amounts could change after freeze | Envelope freeze captures settlement item IDs + amounts; execute verifies against frozen snapshot |
| city_config mutability | ✅ cityConfigService.updateConfig | `pricingEnabled` could toggle after plan creation | Phase 12 snapshots city_config at envelope creation; Phase 13 executes against snapshot |
| Cross-service idempotency key | ❌ No global idempotency registry | Multi-step Phase 13 execution could be duplicated by retrier | Phase 12 envelope hash → Phase 13 retrier idempotent on envelope hash |

## 16. Export Boundary Assessment

| Check | Status | Evidence |
|-------|--------|---------|
| Export generation endpoint | Exists (metadata-only) | `POST /worker-statements/:id/export-once` creates metadata record + content hash. No CSV/XLS/PDF written to disk. |
| Export review UI | Read-only | `SettlementExportReviewPage.tsx` lists records. No download/generate buttons. |
| File download UI | Does not exist | Zero download buttons across entire repo. |
| Pre-signed URL / OSS | Does not exist | `infra/oss/README.md` is placeholder only. No upload or signed URL code. |
| Governance export guards | Disabled | `fileGenerationEnabled: false`, `downloadEnabled: false`. |
| Phase 12 risk | **Medium** | Phase 12 UI/backend code could accidentally introduce file generation or download buttons. |
| Mitigation | Phase 12 gate checks export/download/file patterns. `check-phase12-no-export-generation.ps1`. |

## 17. Required Guardrails Before Implementation

1. **verifyReviewApproved city scope hardening** — blocking pre-implementation item (B4). Separate branch or approved pre-Phase-12 repair required.
2. **Phase 12 no-forbidden-imports gate** — new `check-phase12-no-forbidden-imports.ps1` must block imports from payment/ledger/refund/reversal/settlement-write/provider modules.
3. **Phase 12 execution keywords gate** — block `execute_payout`, `pay_now`, `commit_settlement`, etc. in executable code paths.
4. **Phase 12 write-only-own-tables gate** — verify preparation writes only to `settlement_execution_preparation_*`. No writes to `settlement_action_governance_*` or `settlement_execution_dry_run_*` (B2).
5. **Phase 12 city scope gate** — all preparation SQL must use `city_code = ?` or `buildCityScopedWhere`. Service-level enforcement mandatory (B6).
6. **Phase 12 no-migration-prior-tables gate** — migration 026 must not ALTER Phase 8-11 tables.
7. **Phase 12 no-UI-execution gate** — UI must not have enabled execute/payout/refund/download/export buttons.
8. **Phase 12 freeze immutability gate** — verify frozen envelope status cannot be changed. Verify payload_hash, item_hash, amount_snapshot, city_config_snapshot are write-once (B5).
9. **Phase 12 forbidden-zone gate** — apps/customer/, apps/worker/, package.json, pnpm-lock.yaml must not be changed.
10. **Phase 12 provider/payment boundary gate** — zero imports from providers/, payment/ (B7).
11. **Phase 12 must snapshot city_config at freeze time** — freeze captures CityConfigSnapshot into envelope so Phase 13 executes against frozen config.

## 18. Required Tests Before Implementation

| Test File | Purpose | Est. Tests |
|-----------|---------|------------|
| `tests/unit/envelopeSchema.test.ts` | Validate envelope + item + audit record schemas | ~15 |
| `tests/unit/envelopeFreeze.test.ts` | Verify freeze transition (draft→frozen), idempotent hash lock | ~10 |
| `tests/unit/envelopeApprove.test.ts` | Verify governance-only approval (not execution), status approved_for_phase13_review (B1) | ~10 |
| `tests/security/envelopeNoExecution.test.ts` | Verify no payment/ledger/refund/reversal/settlement-write imports | ~12 |
| `tests/security/envelopeCityScope.test.ts` | City scope enforcement — city_code = ? patterns (B6) | ~7 |
| `tests/security/envelopeStalePacket.test.ts` | Verify stale/pending/rejected packets rejected | ~8 |
| `tests/security/envelopeConflict.test.ts` | Verify conflict check SELECT syntax valid + city-scoped | ~6 |
| `tests/contract/envelope.contract.test.ts` | Verify API response shapes | ~5 |
| `tests/integration/envelopeReadiness.test.ts` | End-to-end packet→envelope pipeline (requires live DB) | ~8 |

## 19. Required Gate Scripts

| Gate Script | Checks |
|-------------|--------|
| `check-phase12-no-forbidden-imports.ps1` | No imports from payment/ledger/refund/reversal/provider/settlement-write in preparation/ or governance/ |
| `check-phase12-no-execution-keywords.ps1` | No execute_payout/pay_now/commit_settlement in executable code paths |
| `check-phase12-only-preparation-tables.ps1` | Writes only to settlement_execution_preparation_* (not governance_* or dry_run_*, per B2) |
| `check-phase12-no-mutation-settlement.ps1` | No UPDATE/DELETE on settlement_batches/items/payables/queue |
| `check-phase12-city-scope.ps1` | All preparation SQL includes city_code = ? or buildCityScopedWhere (B6) |
| `check-phase12-no-migration-prior-tables.ps1` | Migration 026 does not ALTER Phase 8-11 tables |
| `check-phase12-no-export-generation.ps1` | No file generation/download/export endpoint code |
| `check-phase12-no-ui-execution-controls.ps1` | UI has no enabled execute/payout/refund/download buttons |
| `check-phase12-forbidden-zone.ps1` | apps/customer, apps/worker, package.json, pnpm-lock unchanged |

## 20. Pre-implementation Blocker Checklist

| # | Item | Status |
|---|------|--------|
| B1 | Status naming: approved_for_phase13_review | ✅ Corrected in doc |
| B2 | Table write boundary: only preparation tables, no governance_* or dry_run_* | ✅ Corrected in doc |
| B3 | trace_id: Phase 12 audit may include; Phase 11 repair separate | ✅ Corrected in doc |
| B4 | verifyReviewApproved city scope hardening — blocking pre-implementation | ⬜ Requires Phase 11.1 branch |
| B5 | Freeze immutability: payload/snapshot hashes write-once, status append-only | ✅ Corrected in doc |
| B6 | City scope: all SQL must use city_code = ?, service-level enforcement mandatory | ✅ Corrected in doc |
| B7 | Provider/payment boundary: zero imports from providers/, payment/ | ✅ Corrected in doc |

## 21. Decision

- **Phase 12 Readiness**: CONDITIONAL PASS WITH REQUIRED CORRECTIONS
- **Phase 12 implementation may only start after**: B4 blocking pre-implementation hardening completed + Claude/Codex re-inspection
- **Recommended feature branch**: `phase12-settlement-execution-preparation-envelope`
- **Recommended lock tag**: `xlb-phase12-settlement-execution-preparation-envelope`
- **Phase 12 NOT STARTED** — awaiting Release Monitor acknowledgement

## 22. Revision History

| Date | Revision | Description |
|------|----------|-------------|
| 2026-07-05 | R0 | Initial readiness scan — 8-agent parallel scan, unified report |
| 2026-07-05 | R1 | Claude/Codex corrections B1–B7 applied. Status naming, table write boundary, trace_id, verifyReviewApproved hardening, freeze immutability, city scope, provider/payment boundary. |
