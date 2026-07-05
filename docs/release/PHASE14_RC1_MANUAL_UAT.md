# Phase 14 RC1 Manual UAT Evidence

## RC baseline

- Commit: `eb96b45`
- Tag: `phase14-staging-rc1`
- Evidence run ID: `uat-1783262263993`
- Primary evidence log: `docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log`
- Certification retry evidence log: `docs/release/evidence/PHASE14_RC1_UAT_CERT_FIX_20260705T143811Z.log`
- Staging smoke: PASS
- Manual UAT overall status: FAIL
- RC1 decision: REJECTED
- Follow-up required: Phase 14R refund/reversal implementation or explicit scope removal before a new RC

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
| Aftersale refund request | FAIL | Codex | 2026-07-05T14:37:44.242Z | `POST /api/aftersale/refunds` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#aftersale-refund-request | endpoint unavailable or rejected with HTTP 404; aftersale/refund execution is not implemented in current RC |
| RefundApproved event | FAIL | Codex | 2026-07-05T14:37:44.245Z | `SELECT event_outbox WHERE event_type LIKE '%refund%'` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#refundapproved-event | no RefundApproved/refund event produced because refund route is unavailable in current RC |
| Ledger reversal | FAIL | Codex | 2026-07-05T14:37:44.248Z | `POST /api/internal/ledger/reverse; SELECT reversal ledger_entries` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#ledger-reversal | ledger reversal endpoint unavailable/rejected with HTTP 404; no reversal ledger entries found |
| Audit log / trace check | PASS | Codex | 2026-07-05T14:37:44.260Z | `GET /api/internal/settlement-action-governance/audit-trail/gi_mr7wb5am_4455d7e4; SELECT event_outbox trace rows` | docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#audit-log-trace-check | none |

## Failed chain root cause

- Failed chain: aftersale refund request -> RefundApproved event -> ledger reversal.
- Root cause: feature absent in RC1, not an endpoint mismatch.
- Aftersale/refund execution routes and module are not implemented in the current backend.
- RefundApproved event production is not implemented in the current event surface.
- Ledger reversal route/service is not implemented in the current ledger surface.
- Decision: RC1 is rejected. Phase 14R is required before a replacement RC can be cut.

## UAT summary

- PASS: 8
- FAIL: 3
- NOT RUN: 0
- Validation after UAT: SKIPPED because not all UAT checklist items passed.
- Commit: SKIPPED because UAT has FAIL items.

## Smoke evidence

- Status: PASS
- Operator: Codex
- Timestamp: 2026-07-05T14:37:00Z
- Command: `scripts\smoke-staging.ps1`
- Log reference: terminal output from Phase 14 RC1 UAT evidence run
- Blocker: none

## Commit rule

This RC1 failure evidence may be committed to preserve release history. It must not be used to mark UAT PASS or create a replacement RC.
