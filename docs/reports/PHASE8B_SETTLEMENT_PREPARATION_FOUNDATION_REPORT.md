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

- Build: passed (10 tasks)
- Typecheck: passed (14 tasks)
- Tests: 160 files passed; 296 tests passed; 1 pre-existing todo
- Architecture preflight and all six Phase 8B gates: passed
- Docker MySQL/Redis: healthy; migration 013 and all seeds passed
- Real HTTP prepare: first call processed 1; retry processed 0 with no batch
- Batch/item snapshot: CNY 89.00 gross, 8.90 platform fee, 80.10 worker
  receivable, one item, prepared
- Outbox: one pending `settlement.prepared` event for the verified batch
- Shanghai preparation did not consume the Hangzhou accrual; Shanghai access to
  the Hangzhou batch returned 404
- Verified upstream state remained order paid, payment paid, fulfillment
  completed, accrual accrued, and three unchanged ledger entries
