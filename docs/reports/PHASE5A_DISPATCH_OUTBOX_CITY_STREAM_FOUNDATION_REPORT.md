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
