# XLB Phase Boundary — Reference

## Tag → scope matrix

| Tag | Key deliverables |
|-----|------------------|
| xlb-phase7a-worker-accept-fulfillment-skeleton | worker_task_acceptances, fulfillments(accepted), dispatch.accepted |
| xlb-phase7b-fulfillment-start-complete | start/complete API, fulfillment.started/completed events |
| xlb-phase8a-ledger-accrual | ledger_accounts/entries/accruals, ledger run-once |
| xlb-phase8b-settlement-preparation | settlement_batches/items, prepared status, settlement.prepared |
| xlb-phase8c-settlement-confirmation | prepared→confirmed, settlement.confirmed (not locked until tagged) |

## Phase 8A gates (still apply on main)

- check-ledger-consumes-outbox-only.ps1
- check-ledger-no-settlement-payout.ps1
- check-ledger-city-scoped.ps1
- check-fulfillment-no-direct-ledger.ps1
- check-ledger-no-refund-aftersale.ps1
- check-ledger-no-order-payment-mutation.ps1

## Phase 8B gates

- check-settlement-consumes-ledger-accruals-only.ps1
- check-settlement-no-paid-status-in-phase8b.ps1
- check-settlement-prep-no-payout.ps1
- check-settlement-no-upstream-mutation.ps1
- check-settlement-no-refund-aftersale.ps1
- check-settlement-city-scoped.ps1

## Phase 8C gates

- check-settlement-confirm-prepared-only.ps1
- check-settlement-confirm-no-payout-paid.ps1
- check-settlement-confirm-no-ledger-entries.ps1
- check-settlement-confirm-no-upstream-mutation.ps1
- check-settlement-confirm-no-refund-aftersale-reversal.ps1
- check-settlement-confirm-city-scoped.ps1
- check-settlement-confirm-outbox-idempotent.ps1
- check-settlement-confirm-no-provider-withdraw-ui.ps1

## Future phases (NOT open)

| Topic | Status |
|-------|--------|
| Payout / withdrawal | Not Phase 8C |
| Refund / aftersale | Placeholder README only |
| Provider payment split | Not implemented |
|三端 business UI | Not unless phase allows |
| Auto dispatch to worker | Not implemented |

## State machines (do not skip)

```
dispatch_task: pending → queued → accepted
fulfillment: accepted → in_progress → completed
ledger_accrual: accrued (from completed fulfillment)
settlement_batch: prepared → confirmed (8C)
```

Do not jump states without the phase that owns the transition API.
