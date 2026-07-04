# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8D Lock in progress)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD** | `1041079` — merge: add xlb agent skills and current state workflow |
| **agent infra commit** | `4563ca9` — chore(agent): add xlb cursor skills and current state workflow |
| **Phase 8C business baseline tag** | `xlb-phase8c-settlement-confirmation` → `48fb9e1` |
| **Phase 8D body commit** | `3dd99d0` — feat(phase8d): establish settlement payable readiness foundation |
| **Active branch** | `phase8d-settlement-payable-readiness-foundation` — **Lock in progress** |

Note: main @ `1041079` includes agent infrastructure only; Phase 8C business
semantics remain frozen at tag `48fb9e1`.

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0 | `xlb-phase0-foundation` | Monorepo skeleton |
| 1 | `xlb-phase1-request-context-city` | RequestContext, city_code |
| 2 | `xlb-phase2-database-scope-dal` | ScopedExecutor, DAL |
| 3 | `xlb-phase3-cityconfig-catalog-pricing` | CityConfig, catalog, pricing |
| 3A | `xlb-phase3a-official-catalog-*` | Official 16-category / 492 SKU |
| 4 | `xlb-phase4-order-payment-outbox` | Order, payment, outbox |
| 5A | `xlb-phase5a-dispatch-outbox-city-stream` | Dispatch tasks, city stream |
| 5B | `xlb-phase5b-worker-pool-taskpool-readiness` | Worker task pool (read-only) |
| 6 | `xlb-phase6-certification-worker-eligibility` | Certification, eligibility |
| 7A | `xlb-phase7a-worker-accept-fulfillment-skeleton` | Accept, fulfillment skeleton |
| 7B | `xlb-phase7b-fulfillment-start-complete` | Fulfillment start / complete |
| 8A | `xlb-phase8a-ledger-accrual` | Ledger accrual from fulfillment.completed |
| 8B | `xlb-phase8b-settlement-preparation` | Settlement batch prep from accruals |
| 8C | `xlb-phase8c-settlement-confirmation` | prepared → confirmed, settlement.confirmed outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8D** | **Lock in progress** on `phase8d-settlement-payable-readiness-foundation` — body @ `3dd99d0` |
| **8E** | **NOT started** |

## Backend modules present (main @ 8C + 8D branch work)

```
context, city, cityConfig, catalog, pricing,
order, payment, events, streams, dispatch,
worker, compliance, fulfillment, ledger,
settlement (prep + confirm + payable readiness on 8D branch)
```

## Not implemented yet

- payout / withdrawal / provider split / mock payout
- settlement paid / funds movement
- refund / aftersale / reversal (beyond README placeholders)
- apps/* business pages (customer/worker/admin UI flows)
- oa / dashboard apps
- auto worker assignment

## Event chain (8D branch extends 8C)

```
order.created → order.paid → dispatch (queued)
→ worker accept → fulfillment.created (accepted)
→ fulfillment.started → fulfillment.completed
→ ledger accrual (8A)
→ settlement prepared (8B)
→ settlement confirmed (8C)
→ settlement payable readiness (8D, settlement.payable outbox)
```

## Phase 8C boundaries (frozen on tag 48fb9e1)

- ledger_entries unchanged by settlement confirm (still 3 per fulfillment)
- order / payment / fulfillment / accruals: paid / paid / completed / accrued
- Amount snapshot: 89.00 / 8.90 / 80.10 (Hangzhou demo SKU)
- No payout, paid settlement, refund, aftersale, reversal, provider split, withdrawal, UI

## Phase 8D boundaries (in progress)

- Payable readiness is not payout or paid settlement
- No ledger_entries writes; no upstream mutation
- settlement_batches.status stays `confirmed`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8C_SETTLEMENT_CONFIRMATION_FOUNDATION_REPORT.md`
5. In-progress report: `docs/reports/PHASE8D_SETTLEMENT_PAYABLE_READINESS_FOUNDATION_REPORT.md`
6. Architecture: `docs/architecture/15_XLB_SETTLEMENT_PAYABLE_READINESS_FOUNDATION.md`
7. Context map reference: `.cursor/skills/xlb-context-map/reference.md`

## Agent skills (project)

Located in `.cursor/skills/`:

| Skill | Purpose |
|-------|---------|
| `xlb-session-sync` | Mandatory session startup — git + this file |
| `xlb-context-map` | Where to read code/docs without searching the whole repo |
| `xlb-current-vs-target` | SDJ99 blueprint ≠ current repo |
| `xlb-phase-boundary` | What current phase allows / forbids |
| `xlb-phase-lock` | Lock ceremony before merge + tag |

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
