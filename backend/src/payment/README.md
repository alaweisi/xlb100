# Payment module — Phase 4

Mock provider only. The internal adapter models preparation, callback
verification, duplicate delivery, out-of-order delivery, invalid signatures and
transport faults. The existing service remains the sole owner of payment/order
state transitions and the outbox transaction.

No real WeChat/Alipay, merchant account, credential, money movement or external
execution. No dispatch.
