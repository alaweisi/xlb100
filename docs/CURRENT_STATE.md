# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 8K **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `b69cd62` — merge: phase 8i statement audit query foundation |
| **Phase 8K tag** | `xlb-phase8k-settlement-audit-summary` |
| **Phase 8K merge commit** | `af1894b` |
| **Phase 8K feature commit** | `1b177a3` |
| **Phase 8I tag (retained)** | `xlb-phase8i-statement-audit-query` |
| **Phase 8J tag (retained)** | `xlb-phase8j-review-summary-governance` |
| **Active branch** | `main` |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8G | (see prior tags) | Foundation through worker receivable statement review |
| **8H** | `xlb-phase8h-worker-receivable-statement-export-package` | Worker receivable statement export package foundation |
| **8I** | `xlb-phase8i-statement-audit-query` | Statement audit query foundation |
| **8J** | `xlb-phase8j-review-summary-governance` | Review summary / batch governance foundation |
| **8K** | `xlb-phase8k-settlement-audit-summary` | Settlement audit summary foundation |

## In progress (NOT locked)

| Phase | Status |
|-------|--------|
| **8K** | **LOCKED** |
| **8L** | **NOT started** |

## Event chain (8K Lock target)

```
… → statement review (8G)
→ export package (8H)
→ statement audit query (8I)
→ review summary (8J)
→ settlement audit summary (8K) ← LOCKED
```

## Phase 8K boundaries

- Settlement audit summary is read-only (1 GET endpoint, zero writes, batch/payable/queue aggregation)
- No mutation / no UI / no payout / no provider / no notification
- No ledger_entries writes
- worker_receivable_statements.status stays `created`
- worker_receivable_statement_reviews immutable
- worker_receivable_statement_exports immutable

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Latest locked report: `docs/reports/PHASE8I_STATEMENT_AUDIT_QUERY_FOUNDATION_POST_LOCK_REPORT.md`
3. Previous locked report: `docs/reports/PHASE8H_WORKER_RECEIVABLE_STATEMENT_EXPORT_PACKAGE_FOUNDATION_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.