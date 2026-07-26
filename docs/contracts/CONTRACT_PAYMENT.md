# Payment contract and trust boundary

## Scope

Payment orders currently use a Mock provider. No WeChat / Alipay integration or
real money movement exists.

## Rules

1. `POST /api/payments/orders` requires an authenticated Customer application
   identity and an order owned by that exact customer.
2. The order must be `service_completed`; the service revalidates owner, status,
   amount, and currency while holding the order row lock before inserting the
   payment order.
3. `provider = mock`, `status = pending`.
4. `metadata_json` snapshots orderId, cityCode, skuId, priceRuleId, and customerId.
5. Customer applications and `@xlb/api-client` must not expose or invoke a
   simulated paid callback.
6. On a verified paid callback, payment status, order status, and the
   `payment.paid` Outbox event commit in one transaction.
7. **Must not** call dispatch or ledger directly.

## Mock callback isolation

`POST /api/payments/mock-webhook` is a test harness ingress, not a customer API
and not a real provider callback.

- It is absent by default outside `NODE_ENV=test`.
- Local development requires both `PAYMENT_MOCK_WEBHOOK_ENABLED=true` and a
  dedicated `PAYMENT_MOCK_WEBHOOK_SECRET` of at least 24 characters.
- The caller must send the secret in `x-xlb-mock-payment-secret`.
- Production rejects startup if the Mock webhook flag is enabled.
- Staging and production deployment configuration pin the flag to `false`.

A future real provider callback must use that provider's cryptographic signature
verification and replay policy. The Mock secret is not a substitute for a real
provider signature.

## Atomic idempotency

Callback processing locks the payment order before checking or changing state.
The payment update is a compare-and-set from `pending` to `paid`, and the order
update is a compare-and-set from `service_completed` to `paid`.

- Concurrent delivery of the same provider trade number returns one new success
  and one idempotent success, with exactly one Outbox event.
- A different trade number for an already-paid payment is rejected with `409`.
- The `payment_provider_receipts` registry has a database primary key on
  `(provider, provider_trade_no)` and a unique payment-order binding, so the same
  provider transaction cannot pay two local payment orders. Legacy Mock rows are
  not rewritten during migration.
