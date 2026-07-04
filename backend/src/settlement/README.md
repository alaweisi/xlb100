# Settlement preparation

Phase 8B turns city-scoped `ledger_accruals` snapshots into immutable preparation
batches and items. A prepared batch is an accounting preparation artifact only.
It does not move money or change upstream domain state.

Phase 8C adds an explicit city-scoped operator confirmation transition from
`prepared` to `confirmed`. Confirmation records audit identity/time and emits
`settlement.confirmed`; it does not publish or consume `settlement.prepared`.

Phase 8D adds payable readiness for **confirmed** batches only. One
`settlement_payables` row and one `settlement.payable` outbox event are written
per batch. Payable readiness is an audit snapshot — not payout, paid settlement,
or funds movement. Batch status remains `confirmed`.
