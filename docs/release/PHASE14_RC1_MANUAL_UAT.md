# Phase 14 RC1 Manual UAT Evidence

## RC baseline

- Commit: `eb96b45`
- Tag: `phase14-staging-rc1`
- Evidence run ID: `uat-1783262263993`
- Primary evidence log: `docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log`
- Certification retry evidence log: `docs/release/evidence/PHASE14_RC1_UAT_CERT_FIX_20260705T143811Z.log`
- Phase 14R refund/reversal rerun evidence log: `docs/release/evidence/PHASE14R_REFUND_REVERSAL_UAT_20260705T150450Z.log`
- Staging smoke: PASS
- Manual UAT overall status after Phase 14R rerun: PASS
- RC1 decision: REJECTED remains recorded
- Phase 14R corrective rerun: PASS for refund/reversal failed chain

## Staging endpoints

- Backend: `http://localhost:3000`
- Customer app: `http://localhost:4173/`
- Worker app: `http://localhost:4174/`
- Admin app: `http://localhost:4175/`

## Evidence requirements

Each checklist item must include status, operator, timestamp, URL or command, screenshot/log reference, and blocker if failed. Do not mark an item PASS without an attached screenshot or log reference.

## Manual UAT checklist evidence

| Item | Status | Operator | Timestamp | URL or command | Screenshot/log reference | Blocker if failed |
| --- | --- | --- | --- | --- | --- | --- |
| Customer create order | PASS | Codex | 2026-07-05T14:37:44.066Z | `POST http://localhost:3000/api/orders` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#customer-create-order | none |
| Payment metadata snapshot | PASS | Codex | 2026-07-05T14:37:44.096Z | `POST /api/payments/orders; POST /api/payments/mock-webhook; SELECT payment_orders/event_outbox` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#payment-metadata-snapshot | none |
| Dispatch city stream | PASS | Codex | 2026-07-05T14:37:44.115Z | `POST /api/internal/dispatch/run-once; SELECT dispatch_tasks` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#dispatch-city-stream | none |
| Worker accept order | PASS | Codex | 2026-07-05T14:37:44.130Z | `POST /api/worker/tasks/dpt_mr7wb57p_0977c1db/accept` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#worker-accept-order | none |
| Worker fulfill order | PASS | Codex | 2026-07-05T14:37:44.150Z | `POST /api/worker/fulfillments/ful_mr7wb58a_a8c7cb91/start; POST /api/worker/fulfillments/ful_mr7wb58a_a8c7cb91/complete` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#worker-fulfill-order | none |
| Admin city-scope review | PASS | Codex | 2026-07-05T14:37:44.227Z | `POST governance intent/review/approve-governance with wrong-city rejection and right-city approval` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#admin-city-scope-review | none |
| Certification ownership check | PASS | Codex | 2026-07-05T14:38:11.000Z | `POST /api/worker/certifications; wrong-city approve rejection; right-city approve as admin-hangzhou; GET /api/worker/eligibility` | docs/release/evidence/PHASE14_RC1_UAT_CERT_FIX_20260705T143811Z.log#certification-ownership-check | none |
| Aftersale refund request | PASS | Codex | 2026-07-05T15:04:50Z | `POST /api/aftersale/refunds` | docs/release/evidence/PHASE14R_REFUND_REVERSAL_UAT_20260705T150450Z.log#aftersale-refund-request | none |
| RefundApproved event | PASS | Codex | 2026-07-05T15:04:50Z | `POST /api/internal/aftersale/refunds/rfd_mr7xa0cp_21080af3/approve; SELECT event_outbox WHERE event_type='refund.approved'` | docs/release/evidence/PHASE14R_REFUND_REVERSAL_UAT_20260705T150450Z.log#refundapproved-event | none |
| Ledger reversal | PASS | Codex | 2026-07-05T15:04:50Z | `POST /api/internal/ledger/reverse; SELECT ledger_entries WHERE source_type='refund.approved'` | docs/release/evidence/PHASE14R_REFUND_REVERSAL_UAT_20260705T150450Z.log#ledger-reversal | none |
| Audit log / trace check | PASS | Codex | 2026-07-05T14:37:44.260Z | `GET /api/internal/settlement-action-governance/audit-trail/gi_mr7wb5am_4455d7e4; SELECT event_outbox trace rows` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#audit-log-trace-check | none |

## RC1 failed chain root cause

- Failed chain: aftersale refund request -> RefundApproved event -> ledger reversal.
- Root cause: feature absent in RC1, not an endpoint mismatch.
- Aftersale/refund execution routes and module are not implemented in the current backend.
- RefundApproved event production is not implemented in the current event surface.
- Ledger reversal route/service is not implemented in the current ledger surface.
- Decision: RC1 is rejected. Phase 14R is required before a replacement RC can be cut.

## Phase 14R failed-chain rerun

- Corrective implementation branch: `phase14r-refund-reversal`
- Aftersale refund request: PASS
- RefundApproved event: PASS
- Ledger reversal: PASS
- Refund request id: `rfd_mr7xa0cp_21080af3`
- Reversal runner processed count: `1`
- Evidence: `docs/release/evidence/PHASE14R_REFUND_REVERSAL_UAT_20260705T150450Z.log`

## UAT summary

- PASS: 11
- FAIL: 0
- NOT RUN: 0
- Validation before Phase 14R UAT rerun: typecheck PASS, tests PASS, preflight PASS, smoke PASS.
- Commit: allowed because all UAT checklist items have evidence-backed PASS status.

## Smoke evidence

- Status: PASS
- Operator: Codex
- Timestamp: 2026-07-05T14:37:00Z
- Command: `scripts\smoke-staging.ps1`
- Log reference: terminal output from Phase 14 RC1 UAT evidence run
- Blocker: none

## Commit rule

This document preserves RC1 rejection history and records the Phase 14R corrective rerun. It must not be used to create a replacement RC tag.
