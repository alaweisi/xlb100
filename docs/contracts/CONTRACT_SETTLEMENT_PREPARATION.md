# Settlement Preparation Contract (Phase 8B)

## Scope

Phase 8B converts eligible city-scoped `ledger_accruals` (`status=accrued`) into
one preparation batch per non-empty run and one item per accrual. It does not
move funds. Preparation is not payment, withdrawal, provider splitting, refund,
aftersale, or reversal.

`POST /api/internal/settlement/prepare-once` requires admin/operator/city
request context. It returns `{ ok, processed, batch }`; `batch` is null when
`processed` is zero. The transaction writes `settlement.prepared` only when it
creates a non-empty batch.

Idempotency is anchored by `settlement_items.accrual_id UNIQUE`. The source
accrual remains `accrued`, and orders, payment orders, fulfillments, and ledger
entries are not modified.

Phase 8C may discuss confirmation or a mock transfer boundary. Phase 9 owns
refund, aftersale, and reversal work.
