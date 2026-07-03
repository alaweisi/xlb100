# 06_XLB_ORDER_PAYMENT_OUTBOX_FOUNDATION.md

## Phase 4 boundary

| In scope | Out of scope |
|----------|--------------|
| orders table + state machine | Dispatch / worker matching |
| payment_orders (mock) | Real WeChat / Alipay |
| event_outbox write | Ledger / settlement |
| mock webhook | Refund / aftersale |
| price snapshot on order |三端业务 UI |

## Flow

1. Customer creates order → `pending_payment` + `order.created` outbox.
2. Create payment_order (mock, pending).
3. Mock webhook `paid` → payment + order paid + `payment.paid` + `order.paid` outbox.
4. **No dispatch call** — Phase 5 consumes outbox.

## Dependencies

- Phase 3A official catalog / pricing (`sku_home_daily_2h`, price_rules).
- RequestContext cityCode scoping.

## Tables

- `orders`
- `payment_orders`
- `event_outbox`

Migration: `006_order_payment_outbox_foundation.sql`
