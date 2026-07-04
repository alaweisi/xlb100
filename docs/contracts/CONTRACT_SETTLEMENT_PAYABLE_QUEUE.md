# CONTRACT_SETTLEMENT_PAYABLE_QUEUE.md

Phase 8E settlement payable queue — internal enqueue snapshot only.

## Scope

- Input: `settlement_payables.status = payable` with confirmed batch snapshot
- Output: one `settlement_payable_queue` row and one `settlement.payable.queued` outbox event
- Not in scope: payout, paid settlement, provider split, withdrawal, ledger writes

## API

`POST /api/internal/settlement/payables/:payableId/enqueue-once`

Requires admin operator context with `city_code` and `userId`.

## Idempotency

Repeat calls return `idempotent=true` with unchanged `enqueuedAt` / `enqueuedBy`.
No duplicate outbox rows.

## City scope

Cross-city payable access returns 404.
