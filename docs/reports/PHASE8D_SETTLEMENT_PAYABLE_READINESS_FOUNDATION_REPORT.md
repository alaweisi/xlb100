# Phase 8D Settlement Payable Readiness Foundation Report

## Baseline and scope

- Branch: `phase8d-settlement-payable-readiness-foundation`
- Baseline main commit: `10410793c1dc1f3d749614bc6916a1af5b3b0abb`
- Phase 8C tag: `xlb-phase8c-settlement-confirmation` → `48fb9e1dee06383232f7dc6653889afedf190394`
- Objective: one-time payable readiness snapshot for **confirmed** settlement batches with `settlement.payable` outbox
- Scope: payable table, internal API, service/repository, outbox, contracts, tests, gate scripts, docs only

**Payable readiness is not payout, paid settlement, mock payout, withdrawal, or provider split.**

## Implementation

- Migration: `015_settlement_payable_readiness.sql` — `settlement_payables` table
- Status: `payable` only (no `paid`, no payout fields)
- API:
  - `POST /api/internal/settlement/batches/:batchId/mark-payable`
  - `GET /api/internal/settlement/batches/:batchId/payable`
- Service: `settlementPayableService.markSettlementPayable` — confirmed-only, city-scoped, idempotent
- Outbox: exactly one `settlement.payable` per batch (aggregate = payable id)
- `settlement_batches.status` remains `confirmed` after mark-payable

## Engineering verification

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | **184 files / 337 passed / 1 todo** |
| preflight | passed (Phase 0–8D) |

### Gate scripts

| Phase | Result |
|-------|--------|
| Phase 8B (6 gates) | 6/6 passed |
| Phase 8C (8 gates) | 8/8 passed |
| Phase 8D (8 gates) | 8/8 passed |

### Infrastructure

| Check | Result |
|-------|--------|
| Docker MySQL | healthy |
| Docker Redis | healthy |
| migrate-local | passed (015 applied) |
| seed-local | passed |

## Live API chain (integration / real DB)

Full chain validated via integration tests against local MySQL:

```
ledger_accruals → prepare-once → confirm → mark-payable
→ settlement_payables + settlement.payable outbox
```

| Step | Result |
|------|--------|
| prepare-once | processed=1, batch created |
| confirm | status=confirmed, idempotent=false on first call |
| mark-payable 1st | status=payable, idempotent=false |
| mark-payable 2nd | idempotent=true; markedAt / markedBy unchanged |
| settlement.payable outbox | exactly 1 row per payable |
| settlement_batches.status | remains `confirmed` |
| prepared batch mark-payable | HTTP 409 |
| cross-city mark-payable | HTTP 404 |
| cross-city GET payable | HTTP 404 |
| ledger_entries | unchanged (3 per source fulfillment) |
| upstream | order=paid, payment=paid, fulfillment=completed, accrual=accrued |

## Boundary declaration

Phase 8D payable readiness does not implement payout, paid settlement, mock payout,
withdrawal, provider splitting (WeChat / Alipay), refund, aftersale, reversal, or UI
changes. It does not create ledger entries or mutate orders, payments, fulfillments,
or ledger accruals.

**Phase 8D not Lock / not merge / not tag. Phase 8E not started.**

## Status

| Item | Value |
|------|-------|
| Body complete | yes |
| Lock report finalized | yes (this file) |
| Merged to main | no |
| Tag | none |
