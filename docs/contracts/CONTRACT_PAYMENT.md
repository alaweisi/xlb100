# CONTRACT_PAYMENT.md — Phase 4

## Scope

Mock payment provider only. No WeChat / Alipay integration.

## Rules

1. `POST /api/payments/orders` — create `payment_order` for `pending_payment` order.
2. `provider = mock`, `status = pending`.
3. `metadata_json` snapshots orderId, cityCode, skuId, priceRuleId.
4. `POST /api/payments/mock-webhook` — idempotent paid callback.
5. On paid: update payment_order + order, write `payment.paid` and `order.paid` outbox events.
6. **Must not** call dispatch or ledger.

## Idempotency

Duplicate webhook with already-`paid` payment returns success without duplicate side effects.
