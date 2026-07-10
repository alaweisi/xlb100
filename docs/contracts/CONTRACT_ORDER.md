# Order Contract

Phases: 4, 16, and 17

## Scope

City-scoped order creation with official SKU validation, price-rule snapshotting, Phase 16 quote-breakdown persistence, and Phase 17 controlled reverse operations.

## Creation Rules

1. `cityCode` comes from `RequestContext`, never from the request body.
2. Reject `demo_*` and `demo_cleaning_*` SKUs.
3. The SKU must exist and be enabled in `service_skus` for the request city.
4. Price comes from the active `price_rules` and `price_fee_items` records.
5. Store the full quote in `order_price_snapshots.quote_snapshot` for disputes, compensation review, enterprise billing, and audit.
6. The initial order status is `pending_dispatch`.
7. Write `order.created` through `event_outbox`.
8. Order creation cannot assign a worker, mutate a ledger, or execute a refund.

## Reverse Rules

1. Customer reverse requests use the separate Phase 17 contract in `CONTRACT_ORDER_REVERSE.md`.
2. Cancellation application uses the existing order state machine and changes the order to `cancelled` only after admin approval.
3. Reschedule application updates `scheduled_at` and `time_slot` only after admin approval.
4. Reassignment application records an audited intent only. It does not mutate dispatch assignments in Phase 17.
5. Reverse operations cannot execute payment, refund, ledger, settlement, or payout actions.

## API

- `POST /api/orders` - create an order.
- `GET /api/orders/:orderId` - city-scoped order read, including quote snapshot when present.
- `POST /api/orders/:orderId/reverse-requests` - customer reverse request.
- `GET /api/orders/:orderId/reverse-requests` - customer-owned reverse history.

## Order State Machine

- `draft -> pending_dispatch`
- `pending_dispatch -> service_completed | cancelled`
- `service_completed -> paid | cancelled`
- `paid` and `cancelled` are terminal in the current order state machine.
