# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8E **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD** | post-lock main (merge + post-lock docs) |
| **main merge commit (8E)** | `a8893e4` — merge: XLB phase 8E settlement payable queue foundation |
| **Phase 8E body commit** | `20e5608` — feat(phase8e): establish settlement payable queue foundation |
| **Baseline main (pre-8E merge)** | `921f297` — docs(state): align current state with phase 8d tag head |
| **main latest tag (8E)** | `xlb-phase8e-settlement-payable-queue` → post-lock main HEAD |
| **Phase 8D tag (retained)** | `xlb-phase8d-settlement-payable-readiness` → `e60bba7` |
| **Active branch** | `main` — **stable commercial baseline through Phase 8E** |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8C | (see prior tags) | Foundation through settlement confirmation |
| 8D | `xlb-phase8d-settlement-payable-readiness` | confirmed → payable readiness, settlement.payable outbox |
| **8E** | **`xlb-phase8e-settlement-payable-queue`** | payable → queue (status=queued), settlement.payable.queued outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8F** | **NOT started** |

## Event chain (through 8E locked)

```
… → settlement payable readiness (8D, settlement.payable outbox)
→ settlement payable queue (8E, settlement.payable.queued outbox)
```

## Phase 8E boundaries (locked)

- Payable queue is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8E_SETTLEMENT_PAYABLE_QUEUE_FOUNDATION_REPORT.md`
5. Architecture: `docs/architecture/16_XLB_SETTLEMENT_PAYABLE_QUEUE_FOUNDATION.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
