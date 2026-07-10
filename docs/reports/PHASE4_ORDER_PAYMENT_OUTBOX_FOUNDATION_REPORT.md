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

---

## Phase 4-Lock Re-verification (2026-07-03)

**Branch:** `phase4-order-payment-outbox-foundation` @ `0b14488`  
**Lock task:** Order Payment Outbox Foundation Freeze

### 1. Git state

| Check | Result |
|-------|--------|
| Branch | `phase4-order-payment-outbox-foundation` |
| Working tree | clean |
| Commit | `0b14488` feat(phase4): establish order payment outbox foundation |

### 2. Engineering commands

| Command | Result |
|---------|--------|
| `npx pnpm build` | passed |
| `npx pnpm typecheck` | passed |
| `npx pnpm test` | **131 passed** \| 1 todo (132 total) |
| `npx pnpm preflight` | passed (Phase 0–4) |

### 3. Gate scripts

| Script | Result |
|--------|--------|
| `check-payment-no-dispatch.ps1` | passed |
| `check-order-requires-official-sku.ps1` | passed |
| `check-outbox-required.ps1` | passed |

### 4. Docker / DB

| Check | Result |
|-------|--------|
| `xlb-mysql-local` | healthy |
| `xlb-redis-local` | healthy |
| `migrate-local.ps1` | passed (006 already applied) |
| `seed-local.ps1` | passed |
| Tables `orders`, `payment_orders`, `event_outbox` | confirmed |

### 5. Health endpoints

| Endpoint | Status |
|----------|--------|
| `GET /health` | 200, phase=4 |
| `GET /api/system/status` | 200, foundation=order-payment-outbox |
| `GET /api/system/db-health` | 200, mysql=ok, redis=ok |

### 6. Create order API (official SKU)

**Request:** `POST /api/orders` — customer `customer-demo-lock-001`, SKU `sku_home_daily_2h`, city `hangzhou`

| Field | Value |
|-------|-------|
| orderId | `ord_mr4yyhc5_19da3517` |
| ok | true |
| status | pending_payment |
| cityCode | hangzhou |
| skuId | sku_home_daily_2h |
| priceText | ¥89/2小时 |
| priceType | fixed |
| basePrice | 89 |
| totalAmount | 89 |
| priceRuleId | price_hangzhou_sku_home_daily_2h |

### 7. Order price snapshot (DB)

```sql
SELECT order_id, city_code, sku_id, price_text, price_type, base_price, total_amount, status
FROM orders WHERE order_id='ord_mr4yyhc5_19da3517';
```

| Column | Value |
|--------|-------|
| city_code | hangzhou |
| sku_id | sku_home_daily_2h |
| price_text | ¥89/2小时 |
| price_type | fixed |
| base_price | 89.00 |
| total_amount | 89.00 |
| status | pending_payment → paid (after webhook) |

### 8. Payment order API

**Request:** `POST /api/payments/orders` — orderId `ord_mr4yyhc5_19da3517`

| Field | Value |
|-------|-------|
| paymentOrderId | `pay_mr4yz4b8_6d661b2a` |
| ok | true |
| provider | mock |
| status | pending → paid |
| amount | 89 |
| cityCode | hangzhou |
| metadata | orderId, cityCode, skuId, priceRuleId, customerId |

### 9. Mock webhook paid

**Request:** `POST /api/payments/mock-webhook` — status=paid, providerTradeNo=mock-trade-lock-001

| Check | Result |
|-------|--------|
| payment_order.status | paid |
| order.status | paid |
| event_outbox payment.paid | written |
| event_outbox order.paid | written |
| dispatch task created | **no** |
| ledger written | **no** |

### 10. Webhook idempotency

Repeated same webhook payload:

| Check | Result |
|-------|--------|
| HTTP response | 200, ok=true |
| Response flag | `idempotent: true` (2nd call) |
| payment_order.status | still paid |
| order.status | still paid |
| Duplicate paid events | **no** — each event_type count = 1 |

### 11. event_outbox verification

| event_type | aggregate_id | city_code | status | cnt |
|------------|--------------|-----------|--------|-----|
| order.created | ord_mr4yyhc5_19da3517 | hangzhou | pending | 1 |
| payment.paid | pay_mr4yz4b8_6d661b2a | hangzhou | pending | 1 |
| order.paid | ord_mr4yyhc5_19da3517 | hangzhou | pending | 1 |

Payload fields confirmed: `cityCode=hangzhou`; `order.paid` includes `skuId`, `amount=89`, `paidAt`.

### 12. Demo SKU rejection

**Request:** `POST /api/orders` with `skuId=demo_cleaning_sku` → **400**

### 13. Missing cityCode rejection

**Request:** `POST /api/orders` without `x-xlb-city-code` header → **400**

### 14. Dispatch boundary search

```
rg dispatch|dispatchService|workerMatcher|dispatchStream backend/src/{order,payment,events}
```

Only README prohibition notes and comment in `eventHandlers.ts` — **no actual import or call**.

### 15. Ledger boundary search

```
rg ledger|settlement|reversal backend/src/{order,payment,events}
```

Only comment in `eventHandlers.ts` — **no actual import or call**. No `dispatch_*` or `ledger_*` tables in DB.

### 16. Business boundary assessment

| Boundary | Status |
|----------|--------|
| No dispatch | confirmed |
| No ledger / settlement | confirmed |
| No real payment providers | confirmed (mock only) |
| Official SKU only | confirmed |
| Price snapshot at order time | confirmed |
| Outbox on payment success | confirmed |

### 17. Merge readiness

**Ready to merge main and tag `xlb-phase4-order-payment-outbox`.**

Phase 5 (dispatch consuming `order.paid` from outbox) is explicitly out of scope for this lock.

---

## Historical Security Traceability Note (added during Phase 21 review)

The Phase 4 implementation at commit `0b14488` introduced `GET /api/orders/:orderId`
with city-scoped lookup, but it did not enforce customer ownership after loading the
order. The Phase 14 authentication retrofit at commit `8f896b7` bound order creation
to the authenticated `context.userId`, while the read path retained the original
city-only behavior. Consequently, two authenticated customers in the same city could
read each other's order when an order ID was known.

Phase 21 closes this historical Phase 4 read-authorization gap in commit `fbd7faf` by
requiring `order.customerId === context.userId` for customer-app reads and returning
403 through the existing `OrderOwnershipError`. The regression test is
`tests/integration/phase21CustomerOperations.test.ts` (`prevents one customer from
reading another customer's order`): Customer B receives 403 for Customer A's order,
Customer A receives 200, and the persisted `orders.customer_id` remains Customer A.
This note is traceability metadata only; the locked Phase 4 tag and migration remain
unchanged.
