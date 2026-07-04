# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8D locked on main)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD** | `2036acd` — merge: XLB phase 8D settlement payable readiness foundation |
| **main latest tag** | `xlb-phase8d-settlement-payable-readiness` → `2036acd` |
| **agent infra commit** | `4563ca9` — chore(agent): add xlb cursor skills and current state workflow |
| **Phase 8C tag (retained)** | `xlb-phase8c-settlement-confirmation` → `48fb9e1` |
| **Phase 8D body commit** | `3dd99d0` — feat(phase8d): establish settlement payable readiness foundation |
| **Phase 8D docs finalize** | `6358293` — docs(phase8d): finalize settlement payable readiness lock report |
| **backend phase (main)** | `8D` — settlement-payable-readiness-foundation |

Note: Phase 8C tag @ `48fb9e1` is retained as historical business baseline; main
now includes Phase 8D payable readiness on top of agent infra @ `1041079`.

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
| 8D | `xlb-phase8d-settlement-payable-readiness` | confirmed → payable readiness, settlement.payable outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8E** | **NOT started** — do not implement payout / paid settlement / provider split |

## Backend modules present (main @ 8D)

```
context, city, cityConfig, catalog, pricing,
order, payment, events, streams, dispatch,
worker, compliance, fulfillment, ledger,
settlement (prep + confirm + payable readiness)
```

## Not implemented yet

- payout / withdrawal / provider split / mock payout
- settlement paid / funds movement
- refund / aftersale / reversal (beyond README placeholders)
- apps/* business pages (customer/worker/admin UI flows)
- oa / dashboard apps
- auto worker assignment

## Event chain (implemented through 8D)

```
order.created → order.paid → dispatch (queued)
→ worker accept → fulfillment.created (accepted)
→ fulfillment.started → fulfillment.completed
→ ledger accrual (8A)
→ settlement prepared (8B)
→ settlement confirmed (8C)
→ settlement payable readiness (8D, settlement.payable outbox)
```

## Phase 8D boundaries (frozen)

- Payable readiness is not payout, paid settlement, or funds movement
- ledger_entries unchanged (still 3 per fulfillment)
- order / payment / fulfillment / accruals: paid / paid / completed / accrued
- Amount snapshot: 89.00 / 8.90 / 80.10 (Hangzhou demo SKU per fulfillment)
- settlement_batches.status stays `confirmed` after mark-payable
- No payout, paid settlement, refund, aftersale, reversal, provider split, withdrawal, UI

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8D_SETTLEMENT_PAYABLE_READINESS_FOUNDATION_REPORT.md`
5. Architecture: `docs/architecture/15_XLB_SETTLEMENT_PAYABLE_READINESS_FOUNDATION.md`
6. Context map reference: `.cursor/skills/xlb-context-map/reference.md`

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
