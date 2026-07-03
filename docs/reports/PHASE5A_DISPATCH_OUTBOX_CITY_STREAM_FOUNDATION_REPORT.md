# PHASE5A_DISPATCH_OUTBOX_CITY_STREAM_FOUNDATION_REPORT

> Phase 5A — Dispatch Outbox to City Stream Foundation  
> Branch: `phase5a-dispatch-outbox-city-stream-foundation`

## Summary

Phase 5A consumes `event_outbox.order.paid` and creates city-scoped `dispatch_tasks`, publishing to Redis Stream `xlb:dispatch:{cityCode}:orders`. No worker assignment, no fulfillment, no ledger.

## Deliverables

| Area | Path |
|------|------|
| Migration | `db/migrations/007_dispatch_outbox_city_stream_foundation.sql` |
| Dispatch module | `backend/src/dispatch/` |
| Streams module | `backend/src/streams/` |
| Contracts | `CONTRACT_DISPATCH_STREAM.md`, `CONTRACT_DISPATCH_TASK.md` |

## API

- `POST /api/internal/dispatch/run-once` — process pending order.paid for city
- `GET /api/dispatch/tasks` — list city-scoped dispatch tasks

## Gate scripts

- `check-no-national-dispatch-stream.ps1`
- `check-dispatch-consumes-outbox-only.ps1`
- `check-no-payment-to-dispatch-import.ps1`
- `check-dispatch-no-worker-assignment-yet.ps1`

## Not in Phase 5A

Worker assignment, fulfillment, ledger, settlement, refund, certification, app UI.

## Verification

| Check | Result |
|-------|--------|
| build / typecheck / test / preflight | passed (159 tests) |
| Gate scripts (4) | all passed |
| Migration 007 | applied |
| `POST /api/internal/dispatch/run-once` | processed=1 |
| Second run-once | processed=0 (idempotent) |
| dispatch_tasks | city_code=hangzhou, stream_name=xlb:dispatch:hangzhou:orders, status=queued |
| event_outbox order.paid | status=published |
| Redis XRANGE | contains dispatchTaskId / orderId / cityCode |
| No worker_id columns | confirmed |
| payment/order → dispatch import | none |

---

## Phase 5A-Lock Re-verification (2026-07-03)

**Branch:** `phase5a-dispatch-outbox-city-stream-foundation` @ `6e17f97`

### 1. Git state

| Check | Result |
|-------|--------|
| Branch | `phase5a-dispatch-outbox-city-stream-foundation` |
| Working tree | clean |
| Commit | `6e17f97` feat(phase5a): establish dispatch outbox city stream foundation |

### 2. Engineering commands

| Command | Result |
|---------|--------|
| `npx pnpm build` | passed |
| `npx pnpm typecheck` | passed |
| `npx pnpm test` | **159 passed** \| 1 todo (160 total) |
| `npx pnpm preflight` | passed (Phase 0–5A) |

### 3. Gate scripts

| Script | Result |
|--------|--------|
| `check-no-national-dispatch-stream.ps1` | passed |
| `check-dispatch-consumes-outbox-only.ps1` | passed |
| `check-no-payment-to-dispatch-import.ps1` | passed |
| `check-dispatch-no-worker-assignment-yet.ps1` | passed |

### 4. Docker / DB / Redis

| Check | Result |
|-------|--------|
| `xlb-mysql-local` | healthy |
| `xlb-redis-local` | healthy |
| `migrate-local.ps1` | passed (007 already applied) |
| `seed-local.ps1` | passed |
| Table `dispatch_tasks` | confirmed |
| No worker_id / assigned_worker_id columns | confirmed |

### 5. Health endpoints

| Endpoint | Status |
|----------|--------|
| `GET /health` | 200, phase=5A |
| `GET /api/system/status` | 200, foundation=dispatch-outbox-city-stream |
| `GET /api/system/db-health` | 200, mysql=ok, redis=ok |

### 6. Order + payment (official SKU)

| Field | Value |
|-------|-------|
| orderId | `ord_mr4zftfw_fbcdc610` |
| paymentOrderId | `pay_mr4zfthb_58094631` |
| customerId | customer-dispatch-lock-001 |
| skuId | sku_home_daily_2h |
| order.paid before run-once | status=pending |

### 7. Dispatch run-once

| Run | processed |
|-----|-----------|
| First | 1 |
| Second | 0 |

### 8. dispatch_tasks DB

| Field | Value |
|-------|-------|
| dispatch_task_id | `dpt_mr4zg38u_8353b953` |
| city_code | hangzhou |
| order_id | ord_mr4zftfw_fbcdc610 |
| sku_id | sku_home_daily_2h |
| amount | 89.00 |
| source_event_id | evt_mr4zfthq_dbec5a15 |
| stream_name | xlb:dispatch:hangzhou:orders |
| stream_entry_id | 1783086135162-0 |
| status | queued |

### 9. Redis Stream

**KEYS `xlb:dispatch:*`:** only `xlb:dispatch:hangzhou:orders` (no global/all/national)

**XRANGE entry 1783086135162-0:** dispatchTaskId, orderId, cityCode=hangzhou, customerId, skuId, amount=89, sourceEventId

### 10. event_outbox published

| event_type | status | published_at |
|------------|--------|--------------|
| order.created | pending | NULL (not consumed by dispatch) |
| order.paid | **published** | 2026-07-03 13:42:15 |
| payment.paid | pending | NULL (not consumed by dispatch) |

### 11. Idempotency

`SELECT COUNT(*) FROM dispatch_tasks WHERE order_id='ord_mr4zftfw_fbcdc610'` → **cnt=1**

### 12. Boundary searches

| Search | Result |
|--------|--------|
| payment/order → dispatch | only README prohibition notes |
| worker assignment fields | only `assignWorker: false` placeholder in dispatchStrategy |
| fulfillment/ledger/refund in dispatch/streams | only README prohibition in dispatch |

### 13. Merge readiness

**Ready to merge main and tag `xlb-phase5a-dispatch-outbox-city-stream`.**

Phase 5B (worker stream consumer) explicitly out of scope for this lock.
