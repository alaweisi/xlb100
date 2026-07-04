# Phase 8C Settlement Confirmation Foundation Report

## Baseline and scope

- Branch: `phase8c-settlement-confirmation-foundation`
- Phase 8C body commit: `0c425ba9dcf6a28fcc72d326abd2f18426225309`
- Baseline main commit: `bfea4e9651f477abf4a57d98b41c52d11e69f93d`
- Baseline tag: `xlb-phase8b-settlement-preparation`
- Objective: atomically confirm a prepared city-scoped settlement batch and
  write one audit outbox event
- Scope: confirmation state, audit fields, internal API, outbox, contracts,
  tests, and architecture gates only

## Implementation

- Migration: `014_settlement_confirmation.sql`
- State transition: `prepared → confirmed`; cancelled remains reserved
- Audit: `confirmed_at`, `confirmed_by`
- API: `POST /api/internal/settlement/batches/:batchId/confirm`
- Service/repository: city-scoped row locks, snapshot verification, atomic
  batch/item transition, and idempotent retry
- Outbox: exactly one `settlement.confirmed` per batch; `settlement.prepared`
  is untouched by confirmation

## Phase 8C-Lock verification (2026-07-04)

### Engineering

| Check | Result |
|-------|--------|
| build | 10/10 passed |
| typecheck | 14/14 passed |
| test | 176 files / **316 passed** / 1 todo |
| preflight | passed (Phase 0–8C) |

### Gate scripts

| Phase | Result |
|-------|--------|
| Phase 8B (6 gates) | 6/6 passed |
| Phase 8C (8 gates) | 8/8 passed |

### Infrastructure

| Check | Result |
|-------|--------|
| Docker MySQL | healthy |
| Docker Redis | healthy |
| migrate-local | passed (014 applied) |
| seed-local | passed |

### Live API chain (Lock run)

IDs from Lock verification on `phase8c-settlement-confirmation-foundation`:

| Step | ID / result |
|------|-------------|
| Order | `ord_mr5qkw9v_dfa355e9` |
| Payment | `pay_mr5qkwah_c766f559` |
| Fulfillment | `ful_mr5qkwgi_e9dbaaa6` |
| Accrual | `lar_mr5qkwho_0f65acc2` (89.00 / 8.90 / 80.10, accrued) |
| Ledger run-once | processed=1 |
| Prepare-once | processed=1, batch `stb_mr5qkwko_c1d26d99` |
| Confirm 1st | status=confirmed, idempotent=false, confirmed_by=operator-phase8c-lock |
| Confirm 2nd | idempotent=true; confirmed_at / confirmed_by unchanged |
| Confirm Shanghai | HTTP 404 |
| GET items Shanghai | HTTP 404 |
| settlement.confirmed outbox | exactly 1 row (`evt_mr5qkwl5_e0417017`) |
| Batch items | 1 item, status=confirmed |
| ledger_entries | 3 (unchanged) |
| Upstream | order=paid, payment=paid, fulfillment=completed, accrual=accrued |

### Idempotency

- Second confirm returns `idempotent=true` with identical audit fields and amounts.
- No duplicate `settlement.confirmed` outbox rows for the batch.

### Cross-city isolation

- Shanghai confirm and batch-item read both return 404 for Hangzhou batch.

### Upstream immutability

- orders / payment_orders / fulfillments / ledger_accruals unchanged by confirm.
- ledger_entries count remains 3 for source fulfillment.

## Boundary declaration

Phase 8C confirmation is not payment or funds movement. It does not implement
payout, paid settlement, mock payout, withdrawal, provider splitting (WeChat /
Alipay), refund, aftersale, reversal, or UI changes. It does not create ledger
entries or mutate orders, payments, fulfillments, or ledger accruals.

**Phase 8D not started.**

## Lock status

| Item | Value |
|------|-------|
| Body complete | yes |
| Lock report finalized | yes (this commit) |
| Merged to main | pending → see merge commit after Lock |
| Tag | pending → `xlb-phase8c-settlement-confirmation` |

## Prior development verification

Earlier dev run (pre-Lock): batch `stb_mr5q3oqa_e42a4cd7`, confirm by
`operator-phase8c-final` — same behavioral results (idempotent, 404 cross-city,
amounts preserved).
