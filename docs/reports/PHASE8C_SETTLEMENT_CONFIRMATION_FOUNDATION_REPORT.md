# Phase 8C Settlement Confirmation Foundation Report

## Baseline and scope

- Branch: `phase8c-settlement-confirmation-foundation`
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
- Outbox: exactly one `settlement.confirmed`; `settlement.prepared` is untouched

## Verification

- Build: passed (10 tasks)
- Typecheck: passed (14 tasks)
- Tests: 176 files passed; 316 tests passed; 1 pre-existing todo
- Architecture preflight: passed through Phase 8C
- All six Phase 8B gates and all eight Phase 8C gates: passed
- Docker MySQL 8 and Redis 7: healthy; database/Redis health endpoint passed
- `migrate-local`: passed, including migration 014
- `seed-local`: passed without a Phase 8C business seed

## Live API verification

- Prepared batch: `stb_mr5q3oqa_e42a4cd7`, Hangzhou, CNY, one item
- Prepared item: `sti_mr5q3oqa_f55da841`, source accrual
  `lar_mr5q3oou_4e390b6d`
- First confirm: status confirmed, `idempotent=false`
- Confirmation audit: `confirmed_at=2026-07-04T02:11:04.000Z`,
  `confirmed_by=operator-phase8c-final`
- Retry: `idempotent=true` with identical confirmed time, actor, and amounts
- Confirmed outbox: `evt_mr5q734t_2f268d0a`; exactly one
  `settlement.confirmed` event for the batch
- The original `settlement.prepared` event remained pending
- Shanghai confirmation and batch-item access returned 404
- Batch/item amounts remained CNY 89.00 gross, 8.90 platform fee, and 80.10
  worker receivable
- Upstream states remained order paid, payment paid, fulfillment completed, and
  ledger accrual accrued
- The source fulfillment retained exactly three ledger entries

## Boundary declaration

Phase 8C confirmation is not payment or funds movement. It does not implement
payout, paid settlement, mock payout, withdrawal, provider splitting, refund,
aftersale, reversal, or UI changes. It does not create ledger entries or mutate
orders, payments, fulfillments, or ledger accruals.

## Current conclusion

Phase 8C Settlement Confirmation Foundation 主体已完成并通过验证；尚未
Lock、尚未合并 main、尚未打 tag，且未进入 Phase 8D。
