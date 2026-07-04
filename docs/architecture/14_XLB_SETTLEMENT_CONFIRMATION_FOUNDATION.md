# XLB Settlement Confirmation Foundation — Phase 8C

## Flow

`admin/operator/userId + CityCode → prepared batch/items → confirmed batch/items → settlement.confirmed`

The confirmation service locks the city-scoped batch and items, verifies count,
currency, statuses, and amount totals, then updates audit state and inserts the
confirmed event in one transaction. The locked batch row makes retries and
concurrent confirmation idempotent.

## Boundaries

- Only `prepared → confirmed` is implemented; confirmed is terminal in Phase 8C.
- The existing cancelled value is retained, but no cancellation API is added.
- Amount and source identity fields remain immutable.
- Order, payment, fulfillment, ledger accrual, and ledger entry data is not
  modified.
- `settlement.prepared` remains unchanged and is not treated as a required input
  event consumer.
- Confirmation is audit state only; it is not payment or money movement.
