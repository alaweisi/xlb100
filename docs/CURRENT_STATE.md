# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8F **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD** | post-lock main (merge + post-lock docs) |
| **main merge commit (8F)** | `235496f5` — merge: XLB phase 8F worker receivable statement foundation |
| **Phase 8F body commit** | `66b6419` — feat(phase8f): establish worker receivable statement foundation |
| **Baseline main (pre-8F merge)** | `9a0e7ae` — docs(phase8e): record settlement payable queue post-lock state |
| **main latest tag (8F)** | `xlb-phase8f-worker-receivable-statement` → post-lock main HEAD |
| **Phase 8E tag (retained)** | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |
| **Phase 8D tag (retained)** | `xlb-phase8d-settlement-payable-readiness` → `e60bba7` |
| **Active branch** | `main` — **stable commercial baseline through Phase 8F** |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8E | (see prior tags) | Foundation through settlement payable queue |
| **8F** | **`xlb-phase8f-worker-receivable-statement`** | queued → worker receivable statements + worker.receivable.statement.created outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8G** | **NOT started** |

## Event chain (through 8F locked)

```
… → settlement payable queue (8E, settlement.payable.queued outbox)
→ worker receivable statement (8F, worker.receivable.statement.created outbox)
```

## Phase 8F boundaries (locked)

- Worker receivable statement is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`
- settlement_payable_queue.status stays `queued`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8F_WORKER_RECEIVABLE_STATEMENT_FOUNDATION_REPORT.md`
5. Architecture: `docs/architecture/17_XLB_WORKER_RECEIVABLE_STATEMENT_FOUNDATION.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
