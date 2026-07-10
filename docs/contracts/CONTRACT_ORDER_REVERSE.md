# Order Reverse Contract

Phase: 17

## Scope

This contract controls customer cancellation, reschedule, and reassignment requests. It separates the request, admin decision, and application steps so every reverse operation remains city-scoped and auditable.

## Types And States

Reverse types:

- `cancel`
- `reschedule`
- `reassign`

State machine:

- `requested -> approved | rejected`
- `approved -> applied`
- `rejected` and `applied` are terminal.

Invalid transitions return `409`.

## Request Rules

1. The authenticated customer must own the order in the request city.
2. `reason` and `idempotencyKey` are required.
3. A reschedule request must include both `requestedScheduledAt` and `requestedTimeSlot`.
4. The same customer, order, and idempotency key return the existing request rather than creating a duplicate.
5. All reads and writes use the `RequestContext.cityCode` scope.

## Review And Apply Rules

1. Only authenticated admin-app users with role `admin` or `operator` can review or apply a request.
2. Review records the decision, note, admin identity, and timestamp.
3. Cancellation application changes the order through the existing order state machine.
4. Reschedule application updates the order schedule fields.
5. Reassignment application records `dispatchMutation: false` in the audit payload. Phase 17 never mutates a dispatch assignment.
6. Every state change writes an aftersale timeline event and the applicable outbox event.

## API

Customer:

- `POST /api/orders/:orderId/reverse-requests`
- `GET /api/orders/:orderId/reverse-requests`

Admin:

- `GET /api/internal/aftersale/reverse-requests`
- `POST /api/internal/aftersale/reverse-requests/:reverseRequestId/review`
- `POST /api/internal/aftersale/reverse-requests/:reverseRequestId/apply`

## Execution Boundary

- No payment-provider call.
- No refund-provider call.
- No ledger, settlement, payout, or withdrawal mutation.
- No dispatch reassignment mutation.
- No real map or Amap integration.
