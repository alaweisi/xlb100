# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 9C **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `1c928bd` — merge: phase 9c admin settlement export review console |
| **Phase 8 exit tag** | `xlb-phase8-exit-settlement-governance` → `6c38c33` |
| **Phase 9A tag** | `xlb-phase9a-admin-settlement-operations-console` → `dcd4abd` |
| **Phase 9B tag** | `xlb-phase9b-admin-settlement-operations-drilldown` → `0334289` |
| **Phase 9C feature commit** | `c3f0e1b` — feat(admin): add phase 9c settlement export review console |
| **Phase 9C merge commit** | `1c928bd` — merge: phase 9c admin settlement export review console |
| **Active branch** | `main` |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8L | (see prior tags) | Foundation through reconciliation gap scan |
| **8 Exit** | `xlb-phase8-exit-settlement-governance` | Phase 8 settlement governance exited |
| **9A** | `xlb-phase9a-admin-settlement-operations-console` | Admin read-only settlement operations console |
| **9B** | `xlb-phase9b-admin-settlement-operations-drilldown` | Admin settlement operations drilldown |
| **9C** | `xlb-phase9c-admin-settlement-export-review-console` | Admin settlement export review console |

## Phase 9C boundaries

- Admin page: `apps/admin/src/pages/SettlementExportReviewPage.tsx` — export audit list
- Route: `#/settlement-ops/exports` (hash-based)
- Consumed API: `listExportAudit(query)` — Phase 8I locked GET endpoint
- No backend endpoint / no mutation / no migration / no schema change
- No customer UI / no worker UI
- No payout / no provider / no notification / no payment_instruction
- Gate exemptions: 4 Phase 8 `no-ui.ps1` gates — path-specific for SettlementExportReviewPage.tsx

## Validation baseline (Phase 9C lock)

| Check | Result |
|-------|--------|
| Build | admin vite build: 36 modules, passed |
| Typecheck | 10/10 passed |
| Targeted 9C tests | 1 file / 11 passed / 0 failures |
| Full tests | unit/contract all passed |
| Preflight | Phase 0–9C all passed |
| Phase 8 regression (8F–8L) | 56/56 passed |
| Phase 9A regression | 8/8 passed |
| Phase 9B regression | 10/10 passed |
| Phase 9C gates | 10/10 passed |
| Git status | clean |

## Commit lineage (Phase 9C lock baseline)

```
1c928bd merge: phase 9c admin settlement export review console ← CURRENT MAIN
c3f0e1b feat(admin): add phase 9c settlement export review console
0334289 docs(admin): lock phase 9b settlement operations drilldown
```

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Latest locked report: `docs/reports/PHASE9C_ADMIN_SETTLEMENT_EXPORT_REVIEW_CONSOLE_LOCK_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
