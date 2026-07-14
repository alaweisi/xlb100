---
name: xlb-current-vs-target
description: >-
  Distinguishes the implementation in the current XLB worktree from canonical
  Phase/control facts and SDJ99 or blueprint target architecture. Use when a
  user references directory tables, legacy names, planned modules, or asks
  what exists versus what is authorized.
---

# XLB Current vs Target

## Core rule

**Current implementation comes from the current Git worktree. Canonical Phase
and authority come from `G:\xlb100`. Blueprint documents are targets only.**

Run `xlb-session-sync` first. Do not `cd G:\xlb100` and then claim its HEAD,
status, or files describe a managed Work Unit candidate.

| Source | Role | Trust |
|--------|------|-------|
| Current Git top-level and its tracked tree | Branch/candidate implementation | Yes, for what this worktree contains |
| Current worktree `git status`, HEAD, diff | Work Unit construction/candidate state | Yes |
| Canonical `G:\xlb100\docs\CURRENT_STATE.md` | Phase/tag/Lock fact | Yes |
| Canonical governance execution records | Train/Work Unit authority, leases, queue | Yes |
| Current-worktree Phase report/contracts | Candidate design/evidence input | Yes, subject to canonical scope and freshness checks |
| SDJ99 or external directory blueprint | Target inspiration | No, for existence or authority |
| Old Agent conversation | Stale memory | No |

The current and canonical roots must share the same Git common directory. A
historical worktree, separate clone, unregistered path, or mismatching common
directory supplies no construction authority.

## Naming

| Wrong (blueprint / deprecated) | Correct (XLB) |
|-------------------------------|---------------|
| `sdj99`, `@sdj99` | XLB, `@xlb/*` |
| external `00_SDJ99_*` docs | repository `00_XLB_*` documents |

## Common blueprint traps

These may appear in a target structure but are not freely available on every
branch or Phase:

- `backend/src/aftersale/` may be a placeholder or differ by worktree revision.
- Old blueprints may combine ledger and settlement responsibilities that XLB
  keeps separate.
- `apps/oa` and `apps/dashboard` may be placeholders without approved runtime.
- Refund, reversal, invoice, payout, or provider activation requires its own
  current Phase and authority.
- Historical migration numbering never overrides the canonical reservation
  ledger or locked migration tree.

## How to verify existence

```powershell
$CurrentRoot = (git rev-parse --show-toplevel).Trim()
Test-Path -LiteralPath "$CurrentRoot\backend\src\settlement\settlementPreparationService.ts"
git -C $CurrentRoot ls-files -- 'backend/src/<module>/**'
git -C $CurrentRoot log -1 --format='%H %s' -- 'backend/src/<module>/**'
```

For database state:

- A managed Work Unit may inspect only the isolated database/ports leased in
  its canonical Manifest and must follow `xlb-managed-worktree`.
- Hard-coded `xlb_local`, shared ports, `migrate-local.ps1`, and historical
  migration replay belong to the serial canonical Integration lane, not a
  parallel Work Unit.
- File existence or a passing focused test does not create Phase authority.

## Before implementing from a diagram

1. Read canonical `docs/CURRENT_STATE.md` for Phase and Lock facts.
2. If in a Work Unit, read the canonical Charter, Manifest, leases, reservation,
   and evidence plan.
3. Inspect the current worktree for the existing module and candidate base.
4. Read the relevant current-worktree Phase report and contracts.
5. If the capability exists only in a blueprint, or authority is missing,
   stop and request Human Owner adjudication through the required choices.

## Related

- `xlb-session-sync` - resolve canonical and current roots first
- `xlb-managed-worktree` - validate a registered Work Unit
- `xlb-phase-boundary` - Phase and Manifest allow/forbid checks
