# Phase 14R RC2 Manual UAT Evidence

## RC2 baseline

- Candidate implementation commit: `0f0f26d`
- Branch: `phase14r-refund-reversal`
- RC1 rejection evidence commit: `ce5e341`
- Evidence run ID: `uat-1783265108456`
- Primary evidence log: `docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log`
- Staging backend: `http://localhost:3000`
- Customer app: `http://localhost:4173/`
- Worker app: `http://localhost:4174/`
- Admin app: `http://localhost:4175/`

## Gate audit result

- RefundApproved event persisted in `event_outbox`: PASS
- Ledger reversal entries deterministic from original ledger accrual/entries: PASS
- Duplicate refund approval cannot create duplicate reversal entries by service idempotency and repository uniqueness: PASS
- Ledger reversal audit trace written through `conflict_audit` event_outbox rows: PASS
- Replay and immutability gates preserved and passing through preflight: PASS
- Migration 027 reviewed as safely ordered and idempotent for table/index creation: PASS

## Validation summary

| Gate | Status | Evidence |
| --- | --- | --- |
| `npx pnpm typecheck` | PASS | terminal validation run |
| `npx pnpm test -- --bail=1 --reporter=verbose` | PASS | 255 test files, 1048 passed, 1 todo |
| `npx pnpm preflight` | PASS | terminal validation run; replay and immutability included |
| `scripts\smoke-staging.ps1` | PASS | backend, db-health, customer, worker, admin checks passed |
| Full RC2 UAT | PASS | `docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log` |

## UAT checklist evidence

| Item | Status | Operator | Timestamp | URL or command | Screenshot/log reference | Blocker if failed |
| --- | --- | --- | --- | --- | --- | --- |
| Customer create order | PASS | Codex | 2026-07-05T15:25:08Z | `POST http://localhost:3000/api/orders` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#customer-create-order | none |
| Payment metadata snapshot | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/payments/orders; POST /api/payments/mock-webhook; SELECT event_outbox` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#payment-metadata-snapshot | none |
| Dispatch city stream | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/internal/dispatch/run-once; SELECT dispatch_tasks` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#dispatch-city-stream | none |
| Worker accept order | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/worker/tasks/dpt_mr7y0401_57da0f69/accept` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#worker-accept-order | none |
| Worker fulfill order | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/worker/fulfillments/ful_mr7y04fa_a82df407/start; POST /api/worker/fulfillments/ful_mr7y04fa_a82df407/complete` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#worker-fulfill-order | none |
| Admin city-scope review | PASS | Codex | 2026-07-05T15:25:08Z | `POST governance intent/review/approve-governance with wrong-city rejection and right-city approval` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#admin-city-scope-review | none |
| Certification ownership check | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/worker/certifications; wrong-city approve rejection; right-city approve; GET /api/worker/eligibility` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#certification-ownership-check | none |
| Aftersale refund request | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/aftersale/refunds` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#aftersale-refund-request | none |
| RefundApproved event | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/internal/aftersale/refunds/rfd_mr7y04lk_c3b4b04d/approve; SELECT event_outbox WHERE event_type='refund.approved'` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#refundapproved-event | none |
| Ledger reversal | PASS | Codex | 2026-07-05T15:25:08Z | `POST /api/internal/ledger/reverse; SELECT ledger_entries WHERE source_type='refund.approved'` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#ledger-reversal | none |
| Audit log / trace check | PASS | Codex | 2026-07-05T15:25:08Z | `GET /api/internal/settlement-action-governance/audit-trail/<intentId>; SELECT conflict_audit for reversal ledger_entries` | docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log#audit-log-trace-check | none |

## UAT summary

- PASS: 11
- FAIL: 0
- NOT RUN: 0
- Remaining blocker: none
- RC2 manual UAT readiness: GO for annotated RC2 tag after committing evidence and validation-required CI gate convergence.

## Key RC2 evidence identifiers

- Order ID: `ord_mr7y03y8_191fa3fa`
- Fulfillment ID: `ful_mr7y04fa_a82df407`
- Refund ID: `rfd_mr7y04lk_c3b4b04d`
- Primary evidence log: `docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log`
