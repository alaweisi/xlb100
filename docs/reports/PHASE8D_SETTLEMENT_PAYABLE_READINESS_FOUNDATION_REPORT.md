# Phase 8D Settlement Payable Readiness Foundation Report

## Baseline and scope

- Branch: `phase8d-settlement-payable-readiness-foundation`
- Phase 8D body commit: `3dd99d096c7ebb76d48027c091fe63e287e3694a`
- Baseline main commit: `10410793c1dc1f3d749614bc6916a1af5b3b0abb`
- Phase 8C tag: `xlb-phase8c-settlement-confirmation` → `48fb9e1dee06383232f7dc6653889afedf190394`
- Objective: one-time payable readiness snapshot for **confirmed** settlement batches with `settlement.payable` outbox
- Scope: payable table, internal API, service/repository, outbox, contracts, tests, gate scripts, docs only

**Payable readiness is not payout, paid settlement, mock payout, withdrawal, WeChat/Alipay split, or provider split.**

## Implementation

- Migration: `015_settlement_payable_readiness.sql` — `settlement_payables` table
- Status: `payable` only (no `paid`, no payout fields)
- API:
  - `POST /api/internal/settlement/batches/:batchId/mark-payable`
  - `GET /api/internal/settlement/batches/:batchId/payable`
- Service: `settlementPayableService.markSettlementPayable` — confirmed-only, city-scoped, idempotent
- Outbox: exactly one `settlement.payable` per batch (aggregate = payable id)
- `settlement_batches.status` remains `confirmed` after mark-payable

## Phase 8D-Lock verification (2026-07-04)

### Engineering

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

### Live API chain (Lock run)

Full chain on real MySQL (integration + DB spot-check):

```
ledger_accruals → prepare-once → confirm → mark-payable
→ settlement_payables + settlement.payable outbox
```

| Step | ID / result |
|------|-------------|
| Prepare-once | processed=1 |
| Confirm | status=confirmed, idempotent=false |
| Mark-payable 1st | status=payable, idempotent=false |
| Mark-payable 2nd | idempotent=true; markedAt / markedBy unchanged |
| Payable record | `spy_mr5r9fhl_a655267b` |
| Batch | `stb_mr5r9fgs_d57c6bf4` |
| settlement.payable outbox | `evt_mr5r9fhm_756d1919` (exactly 1) |
| Batch status after mark | `confirmed` |
| Amount snapshot | 89.00 / 8.90 / 80.10 (CNY) |
| Prepared batch mark-payable | HTTP 409 |
| Cross-city mark-payable | HTTP 404 |
| Cross-city GET payable | HTTP 404 |
| ledger_entries | 3 per source fulfillment (unchanged) |
| Upstream | order=paid, payment=paid, fulfillment=completed, accrual=accrued |

### Idempotency

- Second mark-payable returns `idempotent=true` with identical audit fields.
- No duplicate `settlement.payable` outbox rows for the same payable.

### Cross-city isolation

- Shanghai mark-payable and GET payable both return 404 for Hangzhou batch.

### Upstream immutability

- orders / payment_orders / fulfillments / ledger_accruals unchanged by mark-payable.
- ledger_entries count remains 3 for source fulfillment.

## Boundary declaration

Phase 8D payable readiness does not implement payout, paid settlement, mock payout,
withdrawal, provider splitting (WeChat / Alipay), refund, aftersale, reversal, or UI
changes. It does not create ledger entries or mutate orders, payments, fulfillments,
or ledger accruals.

**Phase 8D Lock complete. Phase 8E not started.**

## Lock status

| Item | Value |
|------|-------|
| Body complete | yes |
| Lock report finalized | yes |
| Merged to main | yes — `2036acd62f9ece4644835cbee4d495a5c69f1f83` |
| Tag | `xlb-phase8d-settlement-payable-readiness` → `912ae04` (post-lock main HEAD) |
| Phase 8D body commit | `3dd99d0` |
| Phase 8D docs finalize (pre-merge) | `6358293` |
| Post-lock docs commit | `912ae04` |
| Phase 8C tag | retained @ `48fb9e1` (not moved) |

## Lock conclusion

- Merged: yes
- main commit (merge): `2036acd`
- main HEAD (post-lock): `912ae04`
- tag: `xlb-phase8d-settlement-payable-readiness` → `912ae04`
- tests: 184 files / 337 passed / 1 todo
- gates: Phase 8B 6/6, 8C 8/8, 8D 8/8
- live verification: full chain passed on Lock run
- Next phase: Phase 8E not entered
