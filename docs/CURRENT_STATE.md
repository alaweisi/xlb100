# XLB Current State

> **Single source of truth for AI agents.** Update this file at every Phase Lock.
> Do not trust conversation memory — read this file first.

Last updated: 2026-07-04 (Phase 9B **LOCKED**)

## Git snapshot

| Item | Value |
|------|-------|
| **main HEAD (stable baseline)** | `178982a` — merge: phase 9b admin settlement operations drilldown |
| **Phase 8 exit tag** | `xlb-phase8-exit-settlement-governance` → `6c38c33` |
| **Phase 9A tag** | `xlb-phase9a-admin-settlement-operations-console` → `dcd4abd` |
| **Phase 9B feature commit** | `b83fee3` — feat(admin): add phase 9b settlement operations drilldown |
| **Phase 9B merge commit** | `178982a` — merge: phase 9b admin settlement operations drilldown |
| **Active branch** | `main` |

## Locked phases (merged to main + tagged)

| Phase | Tag | Scope (short) |
|-------|-----|---------------|
| 0–8L | (see prior tags) | Foundation through reconciliation gap scan |
| **8 Exit** | `xlb-phase8-exit-settlement-governance` | Phase 8 settlement governance exited |
| **9A** | `xlb-phase9a-admin-settlement-operations-console` | Admin read-only settlement operations console |
| **9B** | `xlb-phase9b-admin-settlement-operations-drilldown` | Admin settlement operations drilldown / detail foundation |

## Phase 9B boundaries

- Admin detail page: `apps/admin/src/pages/SettlementStatementDetailPage.tsx` — statement + review + export + outbox event detail
- Detail route: `#/settlement-ops/statements/:statementId` (hash-based URL route, zero library dependencies)
- Consumed API: `getStatementAuditDetail(statementId)` — Phase 8I locked GET endpoint
- No backend endpoint / no mutation / no migration / no schema change
- No customer UI / no worker UI
- No payout / no provider / no notification / no payment_instruction
- No new npm dependencies

## Validation baseline (Phase 9B lock)

| Check | Result |
|-------|--------|
| Build | admin vite build: 35 modules, passed |
| Typecheck | 10/10 passed |
| Targeted 9B tests | 1 file / 14 passed / 0 failures |
| Full tests | unit/contract all passed |
| Preflight | Phase 0–9B all passed |
| Phase 8 regression (8F–8L) | 56/56 passed |
| Phase 9A regression | 8/8 passed |
| Phase 9B gates | 10/10 passed |
| Git status | clean |

## Commit lineage (Phase 9B lock baseline)

```
178982a merge: phase 9b admin settlement operations drilldown ← CURRENT MAIN
b83fee3 feat(admin): add phase 9b settlement operations drilldown
dcd4abd docs(admin): lock phase 9a settlement operations console
```

## Read order for new session

1. This file (`docs/CURRENT_STATE.md`)
2. Latest locked report: `docs/reports/PHASE9B_ADMIN_SETTLEMENT_OPERATIONS_DRILLDOWN_LOCK_REPORT.md`
3. Previous locked report: `docs/reports/PHASE9A_ADMIN_SETTLEMENT_OPERATIONS_CONSOLE_LOCK_REPORT.md`

## Blueprint warning

The file `xlb100工程目录结构表.txt` (SDJ99 / sdj99 naming) is a **target
architecture blueprint**, not the current XLB implementation. Never copy module
names or paths from it without verifying they exist on the active branch.
