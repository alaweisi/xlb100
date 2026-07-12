# XLB Phase Numbering Policy

This policy preserves the historical Phase line after Phase 24 closure.

## Source Order

1. Git tags and commits.
2. `docs/CURRENT_STATE.md`.
3. `docs/governance/phase-registry.json`.
4. Phase reports and architecture documents.
5. Conversation memory.

If these sources disagree, stop and reconcile before construction.

## Rules

- Historical Phase names, tags, reports, and migrations are immutable evidence. Do not rename or move them for cosmetic consistency.
- Missing historical Lock tags must not be backfilled. Mark those phases as `COMPLETE_UNTAGGED`, `HISTORICAL_INCOMPLETE`, or `INTEGRATED_UNLOCKED`.
- Formal Phase IDs are globally unique. After the Phase 24 closure, new formal work starts at `Phase 25`.
- Letter suffixes such as `23A` and `24F` are subphases of one program. They are not separate top-level programs.
- Decimal or nested IDs are work units or milestones only. They must not be promoted into formal Phase IDs.
- Phase IDs and database migration numbers are decoupled.
- Migration `024` is a permanent reserved gap. Never create `db/migrations/024_*.sql`.
- Phase 9F is a permanent historical skip. Never reuse it.
- Phase 15 is a historical integrated but unlocked work unit. Never reuse it for new work.

## Current Baseline

- Last locked program: `Phase 25`.
- Phase 25 closure tag: `xlb-phase25-ui-standardization-v1.0`.
- Latest verified migration: `053`.
- Phase 25 Lock is complete; no successor phase has been entered.
- Phase 25 is locked; Phase 26 has not been entered.
- Next allowed formal phase: `Phase 26`.

## Required Gate

Run this before a future Lock or Phase handoff:

```powershell
pnpm check:phase-governance
```

`pnpm preflight` also runs this gate.
