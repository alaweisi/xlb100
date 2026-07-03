# PHASE4_ORDER_PAYMENT_OUTBOX_FOUNDATION_REPORT

> Phase 4 — Order + Payment + Outbox Foundation  
> Branch: `phase4-order-payment-outbox-foundation`

## Summary

Phase 4 establishes city-scoped orders, mock payment orders, and transactional event outbox. Payment success writes `order.paid` / `payment.paid` events only — **no dispatch**.

## Deliverables

| Area | Path |
|------|------|
| Migration | `db/migrations/006_order_payment_outbox_foundation.sql` |
| Order module | `backend/src/order/` |
| Payment module | `backend/src/payment/` |
| Events / outbox | `backend/src/events/` |
| Contracts | `docs/contracts/CONTRACT_ORDER.md`, `CONTRACT_PAYMENT.md`, `CONTRACT_EVENT_OUTBOX.md` |

## DB tables

- `orders` — price snapshot, official SKU only
- `payment_orders` — mock provider
- `event_outbox` — pending domain events

## API

- `POST /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/payments/orders`
- `POST /api/payments/mock-webhook`

## Gate scripts

- `check-payment-no-dispatch.ps1`
- `check-order-requires-official-sku.ps1`
- `check-outbox-required.ps1`

## Not in Phase 4

Dispatch, fulfillment, ledger, refund, real payment providers, app UI changes.

## Phase 5

Dispatch consumes `order.paid` from outbox stream — not implemented in Phase 4.

## Verification (Phase 4 build)

- build / typecheck / test / preflight: passed (131 tests)
- Order API: `sku_home_daily_2h` → price snapshot saved, `pending_payment`
- Payment API: mock provider, metadata with skuId/priceRuleId
- Mock webhook: order + payment → `paid`, outbox `order.created` / `payment.paid` / `order.paid`
- Gate scripts: all passed
- No dispatch / ledger code paths
