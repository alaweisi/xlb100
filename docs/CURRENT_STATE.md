# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8G **Lock in progress**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `214da7c` — Phase 8F locked (pre-8G merge) |
| **Phase 8F tag (locked)** | `xlb-phase8f-worker-receivable-statement` → `214da7c` |
| **Phase 8E tag (retained)** | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |
| **Active branch** | `phase8g-worker-receivable-statement-review-foundation` — **Lock ceremony in progress** |
| **Phase 8G body commit** | `2b34a38` |
| **Phase 8G** | **NOT locked yet** (merge/tag pending) |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8E | (see prior tags) | Foundation through settlement payable queue |
| **8F** | **`xlb-phase8f-worker-receivable-statement`** | queued → worker receivable statements + worker.receivable.statement.created outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8G** | **Lock in progress** — body complete on feature branch |
| **8H** | **NOT started** |

## Event chain (8G Lock target)

```
… → worker receivable statement (8F)
→ statement review (8G, worker.receivable.statement.reviewed)
```

## Phase 8G boundaries

- Statement review is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- worker_receivable_statements.status stays `created`
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`
- settlement_payable_queue.status stays `queued`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary` → `xlb-phase-lock`
4. Latest locked report: `docs/reports/PHASE8F_WORKER_RECEIVABLE_STATEMENT_FOUNDATION_REPORT.md`
5. Lock report: `docs/reports/PHASE8G_WORKER_RECEIVABLE_STATEMENT_REVIEW_FOUNDATION_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
