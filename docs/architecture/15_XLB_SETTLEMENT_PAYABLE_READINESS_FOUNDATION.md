# 15 — XLB Settlement Payable Readiness Foundation (Phase 8D)

## Objective

Mark a **confirmed** settlement batch as payable-ready: an internal audit snapshot
that signals future payout phases may proceed. This is **not** payment, payout,
or funds movement.

## Allowed

- `settlement_payables` table (one row per batch)
- `settlement.payable` outbox event
- Internal mark-payable API (city-scoped, idempotent)
- Tests and architecture gate scripts

## Forbidden

- payout / paid settlement / mock payout
- provider split / WeChat / Alipay / withdrawal
- ledger_entries writes
- order / payment / fulfillment / accrual mutation
- settlement_batches.status change to paid or payable
- apps/* UI changes
- refund / aftersale / reversal

## Chain extension

```
… → settlement confirmed (8C)
→ mark payable once (8D)
→ settlement_payables + settlement.payable outbox
```

Phase 8E and payout implementation are out of scope for 8D.
