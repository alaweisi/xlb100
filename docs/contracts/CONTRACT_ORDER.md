# CONTRACT_ORDER.md — Phase 4

## Scope

City-scoped order creation with official SKU validation and price snapshot persistence.

## Rules

1. `cityCode` from RequestContext only — not from request body.
2. Reject `demo_*` / `demo_cleaning_*` SKUs.
3. SKU must exist and be enabled in `service_skus` for the city.
4. Price from `price_rules` snapshot at creation time.
5. Initial status: `pending_payment`.
6. Write `order.created` to `event_outbox`.
7. No dispatch, ledger, or refund in Phase 4.

## API

- `POST /api/orders` — create order
- `GET /api/orders/:orderId` — city-scoped read

## State machine

- `draft` → `pending_payment`
- `pending_payment` → `paid` | `cancelled`
- `paid` is terminal (no rollback)
