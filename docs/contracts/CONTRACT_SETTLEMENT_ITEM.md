# Settlement Item Contract (Phase 8B)

Each item is a city-scoped immutable snapshot of exactly one
`ledger_accruals` row. `accrual_id` is globally unique in the item table. The
item copies fulfillment, order, payment order, worker, customer, SKU, gross,
platform fee, worker receivable, and CNY currency fields from that accrual.

Allowed status values are `prepared` and `cancelled`. There are no provider,
transfer, payout, refund, or aftersale fields.

`GET /api/internal/settlement/batches/:batchId/items` succeeds only when the
batch belongs to the current request city.
