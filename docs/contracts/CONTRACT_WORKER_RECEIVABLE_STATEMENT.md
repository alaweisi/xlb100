# CONTRACT_WORKER_RECEIVABLE_STATEMENT.md

Phase 8F worker receivable statement — internal audit snapshot only.

## Scope

- Input: `settlement_payable_queue.status = queued` with matching payable/batch/items
- Output: `worker_receivable_statements`, `worker_receivable_statement_lines`, and
  `worker.receivable.statement.created` outbox events (one per worker statement)
- Not in scope: payout, paid settlement, provider split, withdrawal, ledger writes

## API

`POST /api/internal/settlement/payables/:payableId/generate-worker-statements-once`

`GET /api/internal/settlement/payables/:payableId/worker-statements`

`GET /api/internal/settlement/worker-statements/:statementId`

Requires admin operator context with `city_code` and `userId`.

## Idempotency

Repeat generate calls return `idempotent=true` with unchanged `generatedAt` / `generatedBy`.
No duplicate statements, lines, or outbox rows.

## City scope

Cross-city payable or statement access returns 404.
