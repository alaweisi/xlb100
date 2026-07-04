# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8G **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD** | post-lock main (merge + post-lock docs) |
| **main merge commit (8G)** | `dbe3824` — merge: XLB phase 8G worker receivable statement review foundation |
| **Phase 8G body commit** | `2b34a38` — feat(phase8g): establish worker receivable statement review foundation |
| **Baseline main (pre-8G merge)** | `214da7c` — docs(phase8f): record worker receivable statement post-lock state |
| **main latest tag (8G)** | `xlb-phase8g-worker-receivable-statement-review` → post-lock main HEAD |
| **Phase 8F tag (retained)** | `xlb-phase8f-worker-receivable-statement` → `214da7c` |
| **Phase 8E tag (retained)** | `xlb-phase8e-settlement-payable-queue` → `9a0e7ae` |
| **Active branch** | `main` — **stable commercial baseline through Phase 8G** |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8F | (see prior tags) | Foundation through worker receivable statement |
| **8G** | **`xlb-phase8g-worker-receivable-statement-review`** | created statement → review record + worker.receivable.statement.reviewed outbox |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8H** | **NOT started** |

## Event chain (through 8G locked)

```
… → worker receivable statement (8F, worker.receivable.statement.created)
→ statement review (8G, worker.receivable.statement.reviewed)
```

## Phase 8G boundaries (locked)

- Statement review is not payout, paid settlement, or funds movement
- No ledger_entries writes; no upstream mutation
- worker_receivable_statements.status stays `created`
- settlement_payables.status stays `payable`; settlement_batches.status stays `confirmed`
- settlement_payable_queue.status stays `queued`

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Run `scripts/agent-context-snapshot.ps1`
3. Execute skills: `xlb-session-sync` → `xlb-context-map` → `xlb-current-vs-target` → `xlb-phase-boundary`
4. Latest locked report: `docs/reports/PHASE8G_WORKER_RECEIVABLE_STATEMENT_REVIEW_FOUNDATION_REPORT.md`
5. Architecture: prior phase docs under `docs/architecture/`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
