---
name: xlb-managed-worktree
description: >-
  Mandatory XLB Release Train and managed-worktree guard. Use after
  xlb-session-sync whenever a task mentions parallel agents, Release Train,
  Work Unit, worktree, lease, migration reservation, integration queue, or when
  the current repository root is not the canonical G:\xlb100 root.
---

# XLB Managed Worktree Guard

This Skill enforces the checked-in governance records. It does not create
authority. A passing check is not permission to merge, Lock, push, deploy, or
activate production.

## Mandatory order

1. Run `xlb-session-sync` and read `docs/CURRENT_STATE.md`.
2. Resolve the current Git top-level and common Git directory.
3. If the task is a WRITE Work Unit, read its canonical Train Charter, Work
   Unit Manifest, Lease Ledger, Migration Reservation Ledger, and Integration
   Queue from `G:\xlb100\governance\execution`.
4. Before the first write, run the boundary command below.
5. Run it again after producing the immutable candidate commit and before
   package audit or queue entry.

## Canonical roots

- `G:\xlb100` is the only canonical integration root.
- `refs/heads/main` resolved once to an immutable commit is the only Work Unit
  control-plane authority. The canonical root's current checkout is not.
- The only approved construction pool is
  `G:\xlb100-worktrees\<train-id>\<work-unit-id>`.
- A construction worktree must be attached to the same Git common directory,
  use the exact Manifest branch and fixed base, and have active path and
  semantic/canonical-writer leases.
- `G:\xlb100-p0-architecture-foundation` is historical and is not implicitly
  approved or enrolled.

## Required command

```powershell
powershell -NoProfile -ExecutionPolicy Bypass `
  -File G:\xlb100\scripts\check-managed-worktree-boundaries.ps1 `
  -Mode WorkUnit `
  -ManifestPath G:\xlb100\governance\execution\work-units\<work-unit-id>.json `
  -WorktreePath G:\xlb100-worktrees\<train-id>\<work-unit-id> `
  -TargetRef HEAD
```

Positive business WRITE results are lane-specific: ordinary managed Work Units
may emit `WORK_UNIT_PARALLEL_ELIGIBLE`; an explicitly bound Integration Owner
serial writer may emit only `WORK_UNIT_SERIAL_CANONICAL_WRITER_ELIGIBLE`.
The serial token is not parallel authority and does not count as one of the
three parallel WRITE slots. It requires Manifest role
`SERIAL_CANONICAL_WRITER`, owner `INTEGRATION-OWNER`, the exact
`integration-queue-and-integration-branch` writer key and
`leaseRefs.canonicalWriter=LEASE-SERIAL-INTEGRATION-QUEUE`. That writer may be
reserved by only one non-terminal Work Unit and its paths must remain a strict
subset of the writer's protected surface. It may never modify
`governance/execution/**` from its construction worktree.
`VALIDATION_ONLY` may emit only `VALIDATION_ENVIRONMENT_ELIGIBLE`; a `PLANNED`
Work Unit can never emit business WRITE eligibility. Any missing
Charter/Manifest/Ledger data, unregistered path, branch/base mismatch, lease
collision, scope escape, or unreserved migration is fail-closed.

Business WRITE additionally requires the registered Train status
`CHARTER_HUMAN_APPROVED`, an explicit approved `humanApprovalStatus`, Train and
Work Unit business-write flags, and Work Unit status `CONSTRUCTION_AUTHORIZED`
or `IN_CONSTRUCTION`. Both Registry fields `executionSystemStatus` and
`enablementStatus` must first be `ENABLED`; while either is not enabled, no
business or validation Work Unit may emit eligibility. Validation eligibility
never grants source-code writes.

## Hard stops

- Do not write from an unregistered or historical worktree.
- Do not edit the Manifest or ledgers from the construction worktree to make a
  failing check pass; return the conflict to the General Contractor.
- Train Charter, Manifest, Lease, Compose override and queue references must
  resolve from the pinned `refs/heads/main` commit at their canonical
  `governance/execution` paths; runtime arguments may not substitute external
  copies or the canonical root's current checkout.
- Do not widen `allowedPaths`, semantic ownership, migration scope, or Phase
  scope locally.
- Do not share a Compose project, MySQL database/volume/port, Redis
  instance/namespace/volume/port, or mutable branch with another WRITE Work
  Unit.
- The Work Unit-local environment file must be named `.env.worktree.local` and
  must pass `git check-ignore`; never stage or commit local credentials/ports.
- Work Units must not run `scripts/migrate-local.ps1`, `scripts/seed-local.ps1`,
  historical migration gates, or any command with hard-coded `xlb_local`,
  shared MySQL/Redis ports, or canonical container names. They may run only
  Work Unit-aware focused checks against the leased isolated environment.
- Full `pnpm preflight`, historical Gate replay, complete migration replay,
  full regression, and cross-domain E2E belong to the serial Integration lane,
  never to parallel Work Unit environments.
- Do not treat `PACKAGE_VERIFIED`, `PACKAGE_AUDITED`, `QUEUED`, or
  `INTEGRATED` as Phase `LOCKED`.
- `PACKAGE_VERIFIED` and later states require a clean immutable candidate,
  digest, fresh contract revision and evidence; audited/queued states also
  require independent audit evidence. A `QUEUED` Work Unit must have exactly
  one matching item in the accepting serial Integration Queue.
- Do not create/remove worktrees, merge main, create tags, push, deploy, or
  perform Lock unless the separately required authority and queue step exists.

## Status block

Before writing, report:

```markdown
## Managed Work Unit sync
- Train / Work Unit: ...
- Worktree / branch / base: ...
- Path lease: ...
- Semantic/canonical-writer lease: ...
- Contract revision: ...
- Migration reservation: NONE | ...
- Isolated environment: database / Redis / Compose slot
- Boundary result: WORK_UNIT_PARALLEL_ELIGIBLE | BLOCKED
```
