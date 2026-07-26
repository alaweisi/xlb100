# Payment module

Mock provider only. The internal adapter models preparation, callback
verification, duplicate delivery, out-of-order delivery, invalid signatures and
transport faults. The existing service remains the sole owner of payment/order
state transitions and the outbox transaction.

Payment-order creation is Customer-only and requires exact order ownership. The
service revalidates the payable order under a row lock before insertion.

The Mock callback route is test infrastructure:

- registered only when `PAYMENT_MOCK_WEBHOOK_ENABLED=true`;
- enabled by default only under `NODE_ENV=test`;
- protected by the dedicated `x-xlb-mock-payment-secret` ingress header;
- forbidden in production at environment validation/startup;
- intentionally absent from the Customer API client and Customer UI.

Callback processing locks the payment and order rows, performs conditional state
transitions, and writes `payment.paid` to the Outbox in one transaction. The
`payment_provider_receipts` registry uniquely binds `(provider,
provider_trade_no)` to one payment order without rewriting legacy Mock facts.

No real WeChat/Alipay, merchant account, credential, money movement or external
execution. No dispatch.
