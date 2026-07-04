---
name: xlb-current-vs-target
description: >-
  Distinguishes XLB current implementation from SDJ99/blueprint target architecture.
  Use when the user shares directory structure tables, mentions sdj99, asks what
  exists vs planned, or when an agent might copy unimplemented modules (refund,
  aftersale, oa, dashboard, payout).
---

# XLB Current vs Target

## Core rule

**The repo on disk is current. Blueprint documents are target.**

| Source | Role | Trust for "does it exist?" |
|--------|------|----------------------------|
| `E:\xlb100` git tree | **Current** | Yes |
| `docs/CURRENT_STATE.md` | **Current summary** | Yes |
| `docs/reports/PHASE*_*.md` | **Locked / in-progress scope** | Yes |
| `xlb100工程目录结构表.txt` (Downloads) | **SDJ99 target blueprint** | **No** — naming, paths, and modules differ |
| Old agent conversation | Stale | **No** |

## Naming

| Wrong (blueprint / deprecated) | Correct (XLB) |
|-------------------------------|---------------|
| sdj99, @sdj99 | XLB, @xlb/* |
| `00_SDJ99_*` docs (if seen externally) | `00_XLB_*` in this repo |

## Common blueprint traps

These appear in target structure but are **not** freely available on every branch:

- `backend/src/aftersale/` — may be README-only placeholder
- `ledger/settlementService` in old blueprint — XLB splits ledger (8A) vs settlement (8B+)
- `apps/oa`, `apps/dashboard` — not in Phase 0–8C scope
- Full refund/reversal/invoice providers — future phases
- Old migration numbers (005_ledger.sql in blueprint ≠ 012_ledger_accrual_foundation)

## How to verify existence

```powershell
# Module exists with real code?
Test-Path backend/src/settlement/settlementPreparationService.ts

# Migration applied?
docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local -N -e "SELECT version FROM schema_migrations ORDER BY version;"
```

Or: `git ls-files backend/src/<module>/`

## Before implementing "from the diagram"

1. Read `docs/CURRENT_STATE.md` — is phase locked?
2. Read latest `docs/reports/PHASE{N}_*.md` — scope boundary
3. Grep repo for existing module — extend, don't duplicate
4. If only in blueprint — **stop**; user must open a new Phase

## Related

- `xlb-phase-boundary` — per-phase allow/forbid
- `xlb-session-sync` — git + CURRENT_STATE first
