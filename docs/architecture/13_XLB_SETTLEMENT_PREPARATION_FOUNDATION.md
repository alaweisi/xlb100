# XLB Settlement Preparation Foundation — Phase 8B

## Flow

`RequestContext → CityCode → accrued ledger_accruals → settlement batch/items → settlement.prepared`

The preparation service performs one transaction. A locking city-scoped read
selects accrued rows not already referenced by an item. The service calculates
batch totals, inserts one batch, inserts one item per source row, and appends one
outbox event. An empty selection writes nothing.

## Boundaries

- The only accounting source is `ledger_accruals`.
- Both new tables reject `__global__` and every API read is city scoped.
- Upstream order, payment, fulfillment, accrual status, and ledger entry data is
  unchanged.
- Phase 8B performs preparation only. It implements no payout, withdrawal,
  provider split, refund, aftersale, reversal, or real transfer.
- A prepared settlement is not a completed payment.

Phase 8C is the earliest phase that may discuss settlement confirmation or a
mock payout. Phase 9 is the earliest phase for refund/aftersale/reversal.
