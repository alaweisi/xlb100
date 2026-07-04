---
name: xlb-phase-boundary
description: >-
  XLB Phase allow/forbid boundaries for monorepo development. Use before
  implementing any feature, when unsure if settlement, payout, ledger, refund,
  accept, or UI is in scope, or when adding imports across modules.
---

# XLB Phase Boundary

**Before writing code:** identify active Phase from `docs/CURRENT_STATE.md`, then check allow/forbid below.

## Universal rules (all phases)

| Rule | Detail |
|------|--------|
| Brand | 喜乐帮 / XLB, `@xlb/*` only |
| Types | `packages/types` → validators → backend; never copy to apps |
| City | Every business table/API scoped by `city_code` |
| Migrations | Append new file; never edit locked migrations |
| Outbox | Side effects via `event_outbox`; consumers city-scoped |
| Apps UI | No business pages unless phase explicitly allows |

## Locked phase summary

See [reference.md](reference.md) for full matrix. Highlights:

| Phase | Allows | Forbids |
|-------|--------|---------|
| 7A | accept, fulfillment skeleton | start, complete, ledger |
| 7B | start, complete, lifecycle events | ledger, settlement, refund |
| 8A | ledger accrual from `fulfillment.completed` | settlement, payout, mutate order/payment/fulfillment |
| 8B | settlement **preparation** from accruals | payout, paid status, refund, upstream mutation |
| 8C | settlement **confirmation**, audit outbox | payout, ledger entries, refund, provider split |

## Module import boundaries (examples)

| From | Must NOT import |
|------|-----------------|
| fulfillment | ledger, settlement |
| ledger | settlement (8A), refund, aftersale |
| settlement prep | payout, payment mutation |
| order / payment | worker accept, ledger, settlement |

Verify with phase gate scripts in `scripts/check-*.ps1`.

## Event consumption boundaries

| Consumer | May consume | Must NOT consume |
|----------|-------------|------------------|
| dispatch | order.paid | fulfillment.* |
| ledger (8A) | fulfillment.completed | order.paid, payment.paid, fulfillment.started |
| settlement prep (8B) | ledger_accruals (accrued) | direct fulfillment, orders |

## How to check before PR

```powershell
npx pnpm preflight
powershell -File scripts/check-<phase-gate>.ps1
rg "forbidden_import" backend/src/<your-module>/
```

## If user asks for out-of-scope work

1. State which Phase owns it
2. Do not implement on current branch
3. Suggest opening next Phase after Lock

## Related

- `docs/CURRENT_STATE.md` — what's locked now
- `xlb-phase-lock` — closing a phase
- `xlb-current-vs-target` — blueprint modules not yet built
