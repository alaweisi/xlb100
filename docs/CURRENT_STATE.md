# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 9A **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `1541045` — fix(admin): harden phase 9a validation gates |
| **Phase 8 exit tag** | `xlb-phase8-exit-settlement-governance` → `6c38c33` |
| **Phase 9A feature commit** | `1b94779` — feat(admin): add phase 9a settlement operations console |
| **Phase 9A merge commit** | `6c26b94` — merge: phase 9a admin settlement operations console |
| **Phase 9A tag** | `xlb-phase9a-admin-settlement-operations-console` |
| **Active branch** | `main` |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8L | (see prior tags) | Foundation through reconciliation gap scan |
| **8 Exit** | `xlb-phase8-exit-settlement-governance` | Phase 8 settlement governance exited |
| **9A** | `xlb-phase9a-admin-settlement-operations-console` | Admin read-only settlement operations console foundation |

## Phase 9A boundaries

- Admin page: `apps/admin/src/pages/SettlementOpsPage.tsx` — read-only console with 4 data-display sections
- Consumed APIs: 4 GET endpoints (worker-statement-audit, worker-statement-review-summary, settlement-audit-summary, reconciliation-gap-scan) — all Phase 8 locked
- No backend endpoint / no mutation / no migration / no schema change
- No customer UI / no worker UI
- No payout / no provider / no notification / no payment_instruction
- No status changes / no auto-fix / no repair / no backfill
- Admin build: `@xlb/api-client` alias added to `apps/admin/vite.config.ts`
- Gate exemptions: 10 Phase 8 `*-no-ui` / `*-no-provider-withdraw-ui` gates exempt 3 admin files (SettlementOpsPage.tsx, App.tsx, vite.config.ts) — provider/withdraw detection logic unchanged
- Dev dependencies: jsdom, @testing-library/react, @testing-library/jest-dom (root devDependencies, not in runtime bundle)

## Validation baseline (Phase 9A lock)

| Check | Result |
|-------|--------|
| Build | admin vite build: 34 modules, passed |
| Typecheck | 10/10 passed |
| Targeted 9A tests | 1 file / 16 passed / 0 failures |
| Full tests | 233 files / 642 passed / 0 failures |
| Preflight | Phase 0–9A all passed |
| Phase 8 regression (8F–8L) | 56/56 passed |
| Phase 9A gates | 8/8 passed |
| Git status | clean |

## Commit lineage (Phase 9A lock baseline)

```
1541045 fix(admin): harden phase 9a validation gates ← CURRENT MAIN
6c26b94 merge: phase 9a admin settlement operations console
1b94779 feat(admin): add phase 9a settlement operations console
6c38c33 docs(settlement): mark phase 8 exit governance complete (Phase 8 exit)
```

Note: `6659104` is a dangling/orphan commit (first merge attempt, superseded by `6c26b94` after amend+remerge). Not in main history.

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Latest locked report: `docs/reports/PHASE9A_ADMIN_SETTLEMENT_OPERATIONS_CONSOLE_LOCK_REPORT.md`
3. Previous locked report: `docs/reports/PHASE8L_RECONCILIATION_GAP_SCAN_LOCK_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
