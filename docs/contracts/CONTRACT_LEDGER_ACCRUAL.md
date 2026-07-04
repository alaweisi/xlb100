# Ledger Accrual Contract (Phase 8A)

The only trigger is a pending, city-scoped `fulfillment.completed` record in
`event_outbox`. Fulfillment code never imports or calls ledger code directly.
Successful processing publishes that outbox event in the same database
transaction that creates the accrual and entries.

One `fulfillment_id` and one `source_event_id` can each identify only one
accrual. Retrying the same event returns the existing accrual.

- `gross_amount = orders.total_amount`
- `platform_fee = round(gross_amount * 0.10, 2)`
- `worker_receivable = gross_amount - platform_fee`
- `currency = CNY`
- `status = accrued`

These values are accounting accruals, not settlement or transferred funds.
Phase 8A has no settlement, payout, withdrawal, refund, aftersale, or reversal.
Settlement preparation belongs to Phase 8B; refund/aftersale/reversal belongs
to Phase 9.
