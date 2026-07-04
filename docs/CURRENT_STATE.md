# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8E in progress on feature branch)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (8D locked)** | `921f297` — docs(state): align current state with phase 8d tag head |
| **main merge commit (8D)** | `2036acd` — merge: XLB phase 8D settlement payable readiness foundation |
| **main latest tag** | `xlb-phase8d-settlement-payable-readiness` → `e60bba7` |
| **Phase 8C tag (retained)** | `xlb-phase8c-settlement-confirmation` → `48fb9e1` |
| **Phase 8D body commit** | `3dd99d0` — feat(phase8d): establish settlement payable readiness foundation |
| **Active branch** | `phase8e-settlement-payable-queue-foundation` — **NOT locked** |

Note: Phase 8D tag @ `e60bba7` is the stable business baseline through payable readiness.
Main @ `921f297` adds only CURRENT_STATE tag alignment docs after Lock.

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8C | (see prior tags) | Foundation through settlement confirmation |
| 8D | `xlb-phase8d-settlement-payable-readiness` | confirmed → payable readiness, settlement.payable outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8E** | **In progress** on `phase8e-settlement-payable-queue-foundation` — payable queue only; not Lock / not merge / not tag |
| **8F** | **NOT started** |

## Event chain (8E branch extends 8D)

```
… → settlement payable readiness (8D, settlement.payable outbox)
→ settlement payable queue (8E, settlement.payable.queued outbox)
```

## Phase 8E boundaries (in progress)

- Payable queue is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8D_SETTLEMENT_PAYABLE_READINESS_FOUNDATION_REPORT.md`
5. In-progress report: `docs/reports/PHASE8E_SETTLEMENT_PAYABLE_QUEUE_FOUNDATION_REPORT.md`
6. Architecture: `docs/architecture/16_XLB_SETTLEMENT_PAYABLE_QUEUE_FOUNDATION.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
