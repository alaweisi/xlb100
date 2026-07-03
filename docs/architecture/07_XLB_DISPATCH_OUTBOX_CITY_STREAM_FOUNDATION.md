# 07 — XLB Dispatch Outbox City Stream Foundation

## Phase 5A scope

Convert `event_outbox.order.paid` → `dispatch_tasks` → city-scoped Redis Stream.

## Architecture boundary

```
payment webhook → order.paid outbox (Phase 4)
                      ↓
              dispatch run-once (Phase 5A)
                      ↓
              dispatch_tasks + Redis Stream
```

**Payment and order modules MUST NOT import dispatch.**

## City stream isolation

Each city has its own stream: `xlb:dispatch:{cityCode}:orders`

No national/global stream. No `__global__`.

## Idempotency

- Unique `source_event_id` on dispatch_tasks
- Unique `order_id` on dispatch_tasks
- Repeat run-once returns `processed: 0` for already-published events

## Not in Phase 5A

- Worker assignment (`workerMatcher` is placeholder)
- Fulfillment, ledger, settlement, refund
- Real map/SMS/push
- App UI changes

## Phase 5B / Phase 6

Worker eligibility after certification audit; stream consumer assigns eligible workers.
