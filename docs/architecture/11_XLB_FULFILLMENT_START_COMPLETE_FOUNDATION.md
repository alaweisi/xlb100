# XLB Fulfillment Start / Complete Foundation — Phase 7B

## Purpose

Phase 7B advances the Phase 7A fulfillment skeleton through the lifecycle
`accepted → in_progress → completed` without creating a financial side effect.

## Command path

1. RequestContext requires worker app, worker role, city code, and user id.
2. Worker city binding is checked.
3. The fulfillment row is locked by fulfillment id + city code + worker id.
4. The state machine validates the transition.
5. The scoped update and lifecycle outbox event are committed atomically.
6. A retry at the command's result state returns `idempotent=true` without a
   second event.

## Persistence

Migration `011_fulfillment_start_complete_foundation.sql` adds nullable text
`completion_note` and rejects `__global__` fulfillment rows. Existing nullable
`started_at` and `completed_at` columns record lifecycle timestamps.

## Explicit exclusions

There is no evidence or image upload, OSS, customer confirmation, ledger,
settlement, payout, refund, aftersale, reversal, or order/payment mutation.
Fulfillment completion is operational state only. Phase 8 owns future
ledger/settlement work; Phase 9 owns future refund/aftersale work.
