# CONTRACT_SETTLEMENT_PAYABLE_READINESS.md

Phase 8D settlement payable readiness — internal audit snapshot only.

## Scope

- Input: `settlement_batches.status = confirmed` with matching confirmed items
- Output: one `settlement_payables` row and one `settlement.payable` outbox event
- Not in scope: payout, paid settlement, provider split, withdrawal, ledger writes

## API

`POST /api/internal/settlement/batches/:batchId/mark-payable`

Requires admin operator context with `city_code` and `userId`.

## Idempotency

Repeat calls return `idempotent=true` with unchanged `markedAt` / `markedBy`.
No duplicate outbox rows.

## City scope

Cross-city batch access returns 404.
