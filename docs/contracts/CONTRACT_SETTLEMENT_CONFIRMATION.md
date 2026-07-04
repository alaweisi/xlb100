# Settlement Confirmation Contract (Phase 8C)

`POST /api/internal/settlement/batches/:batchId/confirm` requires an
admin/operator request context with city and user identity. The batch must
belong to that city. A prepared batch and all its prepared items transition to
confirmed in one transaction, with `confirmed_at` and `confirmed_by` recorded.

The first successful confirmation returns `idempotent=false` and appends one
`settlement.confirmed` outbox event. A repeated request returns the existing
confirmed batch with `idempotent=true` and writes no event. A cancelled batch is
not confirmable. Another city's batch is not visible.

Confirmation changes no amount snapshot, ledger entry, order, payment,
fulfillment, or ledger accrual. It does not consume or publish the existing
`settlement.prepared` event and has no money-transfer semantics.
