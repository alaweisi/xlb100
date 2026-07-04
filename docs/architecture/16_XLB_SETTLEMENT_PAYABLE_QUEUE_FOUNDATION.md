# 16 — XLB Settlement Payable Queue Foundation (Phase 8E)

## Objective

Enqueue a **payable** settlement readiness row into an internal queue snapshot for
future payment phases. This is **not** payment, payout, or funds movement.

## Allowed

- `settlement_payable_queue` table (one row per payable)
- `settlement.payable.queued` outbox event
- Internal enqueue-once API (city-scoped, idempotent)
- Tests and architecture gate scripts

## Forbidden

- payout / paid settlement / mock payout
- provider split / WeChat / Alipay / withdrawal / payment instruction
- ledger_entries writes
- mutation of payables, batches, items, or upstream domain state
- apps/* UI changes
- refund / aftersale / reversal

## Chain extension

```
… → mark payable once (8D)
→ enqueue once (8E)
→ settlement_payable_queue + settlement.payable.queued outbox
```

Phase 8F and payout implementation are out of scope for 8E.
