# Aftersale Complaint Contract

Phase: 17

## Scope

This contract covers customer complaints, customer-service triage, repair visits, liability decisions, compensation intents, resolution, closure, and the shared aftersale timeline.

## Complaint Contract

Categories:

- `service_quality`, `price_dispute`, `material`, `timeliness`
- `attitude`, `safety`, `damage`, `other`

Priorities:

- `normal`, `urgent`, `critical`

State machine:

- `submitted -> triaged | in_progress | rejected`
- `triaged -> in_progress | waiting_customer | resolved | rejected`
- `in_progress -> waiting_customer | resolved | rejected`
- `waiting_customer -> in_progress | resolved | rejected`
- `resolved -> closed | in_progress`
- `closed` and `rejected` are terminal.

The customer must own the referenced order. Complaint creation is idempotent by customer, order, and idempotency key.

## Repair Contract

State machine:

- `requested -> assigned | in_progress | cancelled`
- `assigned -> in_progress | cancelled`
- `in_progress -> completed | cancelled`
- `completed` and `cancelled` are terminal.

Only the assigned worker can start or complete a repair. Completion requires a service note. Worker list queries return only repairs assigned to the authenticated worker in the request city.

## Liability Contract

1. A complaint can have one immutable liability decision.
2. Worker, platform, and customer percentages must total 100, except `no_fault`, which must total 0.
3. Repeating the same decision is idempotent. A different second decision returns `409`.
4. The decision records admin identity, reason, and timestamp.

## Compensation Intent Contract

Intent types:

- `refund`, `service_credit`, `cash`, `fee_waiver`, `rework`

State machine:

- `proposed -> approved | rejected`
- `approved` and `rejected` are terminal.

Approved amount cannot exceed requested amount. Every record has `providerExecutionStatus: not_executed`. Approval is an audited business intent and never calls a refund provider or changes payment, ledger, settlement, or payout data.

## Timeline Contract

Customer, worker, admin, and system actions append city-scoped events to `aftersale_timeline_events`. Events bind to the order and may also bind to a complaint, reverse request, or repair order. The application exposes no update or delete route for timeline events.

## API

Customer:

- `POST /api/aftersale/complaints`
- `GET /api/aftersale/complaints`
- `GET /api/aftersale/complaints/:complaintId`
- `POST /api/aftersale/complaints/:complaintId/notes`

Admin:

- `GET /api/internal/aftersale/complaints`
- `GET /api/internal/aftersale/complaints/:complaintId`
- `POST /api/internal/aftersale/complaints/:complaintId/triage`
- `POST /api/internal/aftersale/complaints/:complaintId/resolve`
- `POST /api/internal/aftersale/complaints/:complaintId/close`
- `POST /api/internal/aftersale/complaints/:complaintId/notes`
- `POST /api/internal/aftersale/complaints/:complaintId/repair-orders`
- `POST /api/internal/aftersale/complaints/:complaintId/liability-decisions`
- `POST /api/internal/aftersale/complaints/:complaintId/compensation-intents`
- `POST /api/internal/aftersale/compensation-intents/:compensationIntentId/review`

Worker:

- `GET /api/worker/aftersale/repair-orders`
- `POST /api/worker/aftersale/repair-orders/:repairOrderId/start`
- `POST /api/worker/aftersale/repair-orders/:repairOrderId/complete`

## Security Boundary

- Customer APIs enforce order ownership.
- Worker APIs enforce assigned-worker ownership.
- Admin APIs require the admin app and role `admin` or `operator`.
- Every table and query is city-scoped; `__global__` is rejected.
- No provider refund, payment, ledger, settlement, payout, withdrawal, or dispatch-assignment execution occurs.
