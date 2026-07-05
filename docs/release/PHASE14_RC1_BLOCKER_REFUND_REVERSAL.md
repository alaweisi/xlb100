# Phase 14 RC1 Blocker: Refund Reversal Chain

## Baseline

- RC tag: `phase14-staging-rc1`
- Commit: `eb96b45`
- Manual UAT status: FAIL
- Decision: RC1 rejected
- Required follow-up: Phase 14R

## Failed UAT chain

| Step | Result | Evidence | Summary |
| --- | --- | --- | --- |
| Aftersale refund request | FAIL | `docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#aftersale-refund-request` | `POST /api/aftersale/refunds` returned HTTP 404. |
| RefundApproved event | FAIL | `docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#refundapproved-event` | No refund-related event was found in `event_outbox`. |
| Ledger reversal | FAIL | `docs/release/evidence/PHASE14_RC1_UAT_20260705T143743Z.log#ledger-reversal` | `POST /api/internal/ledger/reverse` returned HTTP 404 and no reversal ledger entries were found. |

## Root cause

The refund/reversal chain is absent from RC1. This is not an endpoint mismatch.

Observed implementation state:

- `backend/src/aftersale/refund/**` is absent.
- `backend/src/ledger/reversal/**` is absent.
- Aftersale/refund execution routes are not registered in `backend/src/app.ts`.
- RefundApproved event production is not implemented.
- Ledger reversal route/service is not exposed.
- Current contracts/types are placeholder or accrual-only for this chain.

## Classification

- Category: missing feature
- Not route wiring only
- Not module registration only
- Not event handler wiring only
- Not UAT command error

## Release decision

RC1 must remain failed and rejected. Do not remove the failed UAT rows, do not mock refund/reversal, and do not create RC2 until Phase 14R defines and implements the required refund approval and ledger reversal path.

## Minimal next action

Create a Phase 14R branch for scoped implementation planning:

- Define canonical aftersale refund contract.
- Define RefundApproved event contract.
- Define ledger reversal contract and persistence path.
- Implement route/module/event/reversal wiring with existing ledger audit/replay/immutability gates preserved.
- Re-run full validation and manual UAT before cutting any replacement RC.
