# Phase 8A Ledger Accrual Foundation Report

Phase 8A is limited to city-scoped accruals generated from pending
`fulfillment.completed` outbox events. It contains no settlement, payout,
withdrawal, refund, aftersale, reversal, or upstream state mutation.

## Scope

- Tables: `ledger_accounts`, `ledger_entries`, `ledger_accruals`
- Migration: `012_ledger_accrual_foundation`
- Consumer: `POST /api/internal/ledger/run-once` (operator, city-scoped)
- Source event: `fulfillment.completed` only
- **Not in scope:** settlement, payout, withdrawal, refund, aftersale, reversal, invoice, payment provider split, Phase 8B

## Phase 8A-Lock Verification (2026-07-04)

### Engineering

| Check | Result |
|-------|--------|
| `npx pnpm build` | passed |
| `npx pnpm typecheck` | passed |
| `npx pnpm test` | **276 passed**, 1 todo |
| `npx pnpm preflight` | passed (Phase 0–8A) |

### Gate scripts (6/6)

| Script | Result |
|--------|--------|
| `check-ledger-consumes-outbox-only.ps1` | passed |
| `check-ledger-no-settlement-payout.ps1` | passed |
| `check-ledger-no-refund-aftersale.ps1` | passed |
| `check-ledger-city-scoped.ps1` | passed |
| `check-fulfillment-no-direct-ledger.ps1` | passed |
| `check-ledger-no-order-payment-mutation.ps1` | passed |

### Infrastructure

| Check | Result |
|-------|--------|
| Docker `xlb-mysql-local` | healthy |
| Docker `xlb-redis-local` | healthy |
| `migrate-local.ps1` | passed; `012_ledger_accrual_foundation` applied |
| `seed-local.ps1` | passed |
| Ledger tables exist | `ledger_accounts`, `ledger_entries`, `ledger_accruals` |
| Forbidden columns | no settlement_id / payout_id / refund_id / aftersale_id / withdrawal |
| `__global__` in ledger tables | all cnt = 0 |

### Live API chain (Hangzhou lock run)

| Step | ID / Result |
|------|-------------|
| Order | `ord_mr5odpzb_9133574a` |
| Payment | `pay_mr5odpzw_ab72ef40` |
| Dispatch task | `dpt_mr5odq0p_06814ec0` |
| Fulfillment | `ful_mr5odq5v_907af794` |
| Source event | `evt_mr5odq6y_3cdebe01` (`fulfillment.completed`, pending → published) |
| Accrual | `lar_mr5odq7f_72e88172` |

### Ledger run-once

| Run | City | processed | Notes |
|-----|------|-----------|-------|
| 1st | hangzhou | **1** | accrual created |
| 2nd | hangzhou | **0** | idempotent |
| 3rd | shanghai | **0** | cross-city isolation |

### ledger_accruals

- city_code = hangzhou
- gross_amount = 89.00, platform_fee = 8.90, worker_receivable = 80.10
- currency = CNY, status = accrued
- source_event_id = `evt_mr5odq6y_3cdebe01`

### ledger_entries (3)

| account_type | direction | amount |
|--------------|-----------|--------|
| customer | debit | 89.00 |
| platform | credit | 8.90 |
| worker | credit | 80.10 |

source_type = `fulfillment.completed`, source_id = fulfillmentId, city_code = hangzhou, currency = CNY

### ledger_accounts

- customer / customer-ledger-lock-001 / CNY / active
- platform / platform / CNY / active
- worker / worker-demo-hangzhou / CNY / active

### event_outbox

- `fulfillment.completed` → **published** (published_at set)
- Other events on same aggregate (created, started) remain **pending** — ledger only consumes `fulfillment.completed`
- `order.paid` published; ledger did not consume non-ledger events

### Upstream state unchanged

| Entity | Status |
|--------|--------|
| order | paid |
| payment_order | paid |
| fulfillment | completed |

### Boundary checks (rg)

- `backend/src/ledger`: no settlement/payout/refund/aftersale implementation (README docs only)
- `backend/src/ledger`: no UPDATE orders/payment_orders/fulfillments
- `backend/src/fulfillment`: no ledger import (README docs only)
- `db/migrations/012_*`, `db/schema/ledger.sql`: no forbidden table/field names

## Lock readiness

- **Merge main:** ready after this report commit
- **Tag:** `xlb-phase8a-ledger-accrual`
- **Phase 8B:** not entered

## Prior verification (development)

- Live order: `ord_mr55lxyd_97d2c022`
- Live fulfillment: `ful_mr55ly0t_72c0b594`
- First dev run processed 1; retry processed 0 (same accrual pattern)
