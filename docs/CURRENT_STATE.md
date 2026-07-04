# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8H **Lock in progress**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `1679327` — Phase 8G locked (pre-8H merge) |
| **Phase 8G tag (locked)** | `xlb-phase8g-worker-receivable-statement-review` → `1679327` |
| **Active branch** | `phase8h-worker-receivable-statement-export-package-foundation` — **Lock ceremony in progress** |
| **Phase 8H body commit** | `21e8cf7` |
| **Phase 8H** | **NOT locked yet** (merge/tag pending) |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8G | (see prior tags) | Foundation through worker receivable statement review |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8H** | **Lock in progress** — body complete on feature branch |
| **8I** | **NOT started** |

## Event chain (8H Lock target)

```
… → statement review (8G)
→ export package (8H, worker.receivable.statement.exported)
```

## Phase 8H boundaries

- Export package is not payout, paid settlement, or funds movement
- No ledger_entries writes; no real notification sending
- worker_receivable_statements.status stays `created`
- worker_receivable_statement_reviews immutable

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Latest locked report: `docs/reports/PHASE8G_WORKER_RECEIVABLE_STATEMENT_REVIEW_FOUNDATION_REPORT.md`
3. Lock report: `docs/reports/PHASE8H_WORKER_RECEIVABLE_STATEMENT_EXPORT_PACKAGE_FOUNDATION_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
