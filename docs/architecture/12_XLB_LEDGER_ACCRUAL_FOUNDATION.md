# 12 — Ledger Accrual Foundation

Phase 8A introduces `ledger_accounts`, `ledger_entries`, and `ledger_accruals`.
All three are city scoped, reject `__global__`, and use CNY.

The dependency direction is one way:

`fulfillment.completed -> event_outbox -> ledger consumer -> accrual + entries`

The consumer reads only pending `fulfillment.completed` events. In one
transaction it validates the completed fulfillment plus paid order/payment
snapshot, creates or reuses the three accounts, inserts one accrual and three
entries, then marks the event published. Unique fulfillment and event keys make
reprocessing idempotent.

Ledger reads order, payment, and fulfillment state but never mutates it.
Fulfillment has no ledger dependency. Phase 8A deliberately excludes
settlement, payout, withdrawal, refund, aftersale, reversal, invoice, and
payment-provider splitting. Gross, platform fee, and worker receivable are
accruals only. Phase 8B may prepare settlement; Phase 9 owns refund, aftersale,
and reversal.
