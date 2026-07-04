# 17 — XLB Worker Receivable Statement Foundation (Phase 8F)

## Objective

Generate **worker-level receivable statement snapshots** from a queued payable by
aggregating immutable `settlement_items`. This is **not** payment, payout, or funds movement.

## Allowed

- `worker_receivable_statements` and `worker_receivable_statement_lines` tables
- `worker.receivable.statement.created` outbox event (one per worker statement)
- Internal generate-once and read APIs (city-scoped, idempotent)
- Tests and architecture gate scripts

## Forbidden

- payout / paid settlement / mock payout
- provider split / WeChat / Alipay / withdrawal / payment instruction
- ledger_entries writes
- mutation of queue, payables, batches, items, or upstream domain state
- apps/* UI changes
- refund / aftersale / reversal

## Chain extension

```
… → enqueue once (8E)
→ generate worker statements once (8F)
→ worker_receivable_statements + worker.receivable.statement.created outbox
```

Payout implementation is out of scope for 8F.
