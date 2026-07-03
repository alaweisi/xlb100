# CONTRACT_FULFILLMENT_LIFECYCLE

## Scope

Phase 7B adds worker-owned, city-scoped fulfillment start and complete commands.
It does not add evidence, customer confirmation, money movement, ledger,
settlement, payout, refund, or aftersale behavior.

## State transitions

| Command | Required current status | Result status | Retry |
|---------|-------------------------|---------------|-------|
| start | accepted | in_progress | in_progress returns `idempotent=true` |
| complete | in_progress | completed | completed returns `idempotent=true` |

Completed and cancelled fulfillments are terminal. An accepted fulfillment
cannot be completed directly.

## Worker API

- `POST /api/worker/fulfillments/:fulfillmentId/start`, strict empty body.
- `POST /api/worker/fulfillments/:fulfillmentId/complete`, optional
  `completionNote` text up to 255 characters.

Both commands require worker app/role headers, a non-global `city_code`, and a
worker user id. The repository lock and state update are constrained by
`fulfillment_id`, `city_code`, and `worker_id`.

## Events

- `fulfillment.started` includes fulfillment, acceptance, dispatch task,
  order, city, worker, SKU, and `startedAt` identifiers.
- `fulfillment.completed` includes the same identity fields plus `completedAt`
  and nullable `completionNote`.

State update and event insertion share one database transaction. Idempotent
retries do not create duplicate lifecycle events.

## Boundary

Completion means only that the service fulfillment reached `completed`. It is
not customer confirmation and not financial settlement. Phase 8 is the first
phase allowed to introduce ledger/settlement. Phase 9 is the first phase
allowed to introduce refund/aftersale.
