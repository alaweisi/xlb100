# CONTRACT_WORKER_ACCEPT

Phase 7A — Worker accept for queued dispatch tasks. Requires eligibility.

## API

### POST /api/worker/tasks/:dispatchTaskId/accept

Headers: worker app, worker role, city code, user id.

Body: `{}` (strict — no workerId/cityCode override).

## Rules

1. Worker must be bound to cityCode.
2. Worker must have eligibility=true for task skuId.
3. dispatch_task must be status=queued in same cityCode.
4. One acceptance per dispatch_task (unique dispatch_task_id).
5. Same worker repeat accept is idempotent.
6. Other worker gets 409 if already accepted.

## Side effects

- dispatch_tasks.status → accepted
- worker_task_acceptances row
- fulfillments skeleton status=accepted
- event_outbox: dispatch.accepted, fulfillment.created

## Not in Phase 7A

start, complete, ledger, settlement, refund, payment/order changes.
