# 10 — XLB Worker Accept + Fulfillment Skeleton (Phase 7A)

## Purpose

Eligible workers accept queued city-scoped dispatch tasks. Creates acceptance record, fulfillment skeleton, and outbox events.

## Flow

```
GET task-pool (queued) → POST accept (eligible worker)
  → dispatch_tasks.status = accepted
  → worker_task_acceptances
  → fulfillments (accepted skeleton)
  → event_outbox: dispatch.accepted, fulfillment.created
```

## Prerequisites

- Phase 6 eligibility must pass before accept.
- Worker city binding required.

## Out of scope

start, complete, evidence, ledger, settlement, refund, app UI.

Phase 7B: fulfillment start/complete.
