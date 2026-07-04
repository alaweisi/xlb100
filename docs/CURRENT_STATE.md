# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8F in progress on feature branch)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (8E locked)** | `9a0e7ae` — docs(phase8e): record settlement payable queue post-lock state |
| **main latest tag (8E)** | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |
| **Phase 8D tag (retained)** | `xlb-phase8d-settlement-payable-readiness` → `e60bba7` |
| **Active branch** | `phase8f-worker-receivable-statement-foundation` — **NOT locked** |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8C | (see prior tags) | Foundation through settlement confirmation |
| 8D | `xlb-phase8d-settlement-payable-readiness` | confirmed → payable readiness, settlement.payable outbox |
| **8E** | **`xlb-phase8e-settlement-payable-queue`** | payable → queue (status=queued), settlement.payable.queued outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8F** | **In progress** on `phase8f-worker-receivable-statement-foundation` — worker receivable statement only; not Lock / not merge / not tag |
| **8G** | **NOT started** |

## Event chain (8F branch extends 8E)

```
… → settlement payable queue (8E, settlement.payable.queued outbox)
→ worker receivable statement (8F, worker.receivable.statement.created outbox)
```

## Phase 8F boundaries (in progress)

- Worker receivable statement is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`
- settlement_payable_queue.status stays `queued`

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
