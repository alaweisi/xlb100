---
name: xlb-phase-boundary
description: >-
  Resolves XLB Phase and Work Unit allow/forbid boundaries using canonical
  control records plus the current worktree candidate. Use before implementing
  a feature, changing a contract or migration, or running validation.
---

# XLB Phase Boundary

**Before writing:** run `xlb-session-sync`, classify the current root, then
combine canonical Phase authority with the exact Work Unit scope. Neither one
alone is permission.

## Fact locations

| Fact | Required root |
|------|---------------|
| Phase/tag/Lock state | `docs/CURRENT_STATE.md` at pinned `refs/heads/main` commit |
| Constitution, ADR authority, Train registry and Charter | pinned canonical control commit |
| Work Unit Manifest, leases, reservation and queue | pinned canonical control commit under `governance/execution` |
| Current branch, HEAD, status, diff and source | current Git top-level |
| Candidate contracts, tests and gate implementation | current Git top-level |

Verify the current and canonical Git common directories match. If the current
root is a managed Work Unit, run `xlb-managed-worktree`; if it is outside the
approved pool or not registered, source writes are prohibited. Never force
`cd G:\xlb100` to evaluate a Work Unit branch.

## Boundary intersection

A write is allowed only when all applicable sets include it:

1. canonical Phase/Train authority;
2. Human approval required by ADR level;
3. Work Unit `allowedPaths` and non-matching `forbiddenPaths`;
4. active path plus semantic/canonical-writer lease;
5. contract revision and migration reservation, when applicable;
6. current execution-system and Train/Work Unit status;
7. evidence plan and isolated environment constraints.

Missing, unknown, stale, or conflicting facts fail closed. A file-level path
match does not override a semantic ownership conflict.

## Universal rules (all phases)

| Rule | Detail |
|------|--------|
| Brand | 喜乐帮 / XLB and `@xlb/*` only |
| Types | `packages/types` -> validators -> backend; never copy to apps |
| City | Every business table/API is scoped by `city_code` |
| Migrations | Reserve first, append a new file, never edit locked migrations |
| Outbox | Side effects use `event_outbox`; consumers remain city-scoped |
| Apps UI | No business pages unless the active scope explicitly allows them |
| Fake state | Frontend projects backend truth; no fake workflow success/state |

## Phase evidence lookup

Do not embed a historical phase matrix in this Skill. Resolve the active
boundary from canonical `CURRENT_STATE.md`, the governing Phase/Lock report,
the current Work Unit Manifest when applicable, and the actual gate scripts at
the candidate commit. Historical matrices are not authority and become unsafe
when copied forward.

## Module import boundaries (examples)

| From | Must NOT import |
|------|-----------------|
| fulfillment | ledger, settlement |
| ledger | 当前 Phase/Manifest 禁止的结算、退款、售后 |
| settlement preparation | 出款或支付写入 |
| order / payment | worker accept, ledger, settlement internals |

Verify the actual current-worktree source with current-worktree gates and the
canonical Phase/Manifest scope.

## Validation lanes

- Parallel Work Units may run only Manifest-approved focused checks against
  their leased isolated environment.
- `migrate-local.ps1`, `seed-local.ps1`, hard-coded `xlb_local`, full
  `pnpm preflight`, historical gate replay, full regression, cross-domain E2E,
  and full migration replay belong to the serial canonical Integration lane.
- A `VALIDATION_ONLY` manifest is not business-write authority.
- Global `NOT_ENABLED` or a non-authorized Train/Work Unit status must fail
  closed even when static checks pass.

## Check sequence

1. Resolve roots and read canonical control facts.
2. Read current-worktree branch/HEAD/status/diff.
3. For a Work Unit, run the canonical Manifest boundary command from
   `xlb-managed-worktree` before the first write.
4. Run only lane-appropriate focused tests during Work Unit construction.
5. Re-run the boundary gate against the clean immutable candidate before audit
   or queue entry.
6. Run full preflight/replay only in the serial Integration lane.

## If the request is out of scope

1. State the conflicting canonical Phase, Train, Manifest, lease, or authority.
2. Do not implement it on the current branch.
3. Present the Human Owner with plain-language, mutually exclusive choices when
   a Human decision is genuinely required.

## Related

- `xlb-session-sync` - root/state resolution
- `xlb-managed-worktree` - Work Unit boundary enforcement
- `xlb-phase-lock` - canonical-root-only Phase closure
- `xlb-current-vs-target` - planned versus present implementation
