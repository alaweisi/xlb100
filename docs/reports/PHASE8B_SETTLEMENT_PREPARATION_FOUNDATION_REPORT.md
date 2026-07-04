# Phase 8B Settlement Preparation Foundation Report

## Delivered

- Strict shared batch/item contracts and validators
- Migration 013 with city checks, amount checks, preparation-only statuses, and
  one-item-per-accrual uniqueness
- Transactional prepare-once service and `settlement.prepared` outbox event
- City-scoped batch and item query APIs
- API client methods without UI wiring
- Unit, integration, contract, security, and PowerShell architecture gates

## Scope declaration

This phase only prepares settlement accounting snapshots sourced from
`ledger_accruals`. Prepared does not mean paid. No payout, withdrawal, provider
split, refund, aftersale, reversal, or upstream state mutation is implemented.

Phase 8C may discuss confirmation/mock payout. Phase 9 owns refund,
aftersale, and reversal.

## Verification

- Branch: `phase8b-settlement-preparation-foundation`
- Phase 8B implementation commit: `58ad7c4`
- Build: passed (10 tasks)
- Typecheck: passed (14 tasks)
- Tests: 160 files passed; 296 tests passed; 1 pre-existing todo
- Architecture preflight: passed
- All six Phase 8B gates passed: no payout/withdrawal, city scope, accrual-only
  source, no refund/aftersale/reversal, no upstream mutation, and no paid state
- Docker MySQL 8 and Redis 7: healthy; database and Redis connection checks passed
- `migrate-local` passed with migration 013 already applied; `seed-local` passed
- `settlement_batches` and `settlement_items` exist; Phase 8A ledger table
  structures remain intact

## Phase 8B Lock live verification

- Request: `POST /api/internal/settlement/prepare-once`, city `hangzhou`
- Source accrual: `lar_mr5pdx36_720feb2c`
- First response: `processed=1`, batch `stb_mr5pdxln_7980c215`
- Item: `sti_mr5pdxln_fe7e6d3a`
- Outbox: `evt_mr5pdxlp_46d90d33`, type `settlement.prepared`, pending
- Batch/item snapshot: CNY 89.00 gross, 8.90 platform fee, 80.10 worker
  receivable, one item, prepared
- Idempotency: second response was `processed=0, batch=null`; batch/item/outbox
  totals stayed at 25/114/25 after increasing exactly once from 24/113/24
- The source accrual has exactly one settlement item
- Shanghai preparation returned `processed=0, batch=null` before Hangzhou
  preparation and did not consume the Hangzhou accrual
- Shanghai access to the Hangzhou batch returned 404; cross-city item leaks: 0
- Verified upstream state remained order paid, payment paid, fulfillment
  completed, accrual accrued, and three unchanged ledger entries

## Lock boundary conclusion

- No payout, settlement-paid, mock-payout, provider split, withdrawal, refund,
  aftersale, or reversal implementation or database object entered Phase 8B
- No customer, worker, or admin UI file changed
- Settlement preparation continues to source only `ledger_accruals`
- Phase 8B settlement preparation foundation satisfies the lock criteria and is
  ready to merge into the stable main line
