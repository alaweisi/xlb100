# Stage 4A data reliability runbook

## Scope

Stage 4A verifies local, non-production readiness for:

- full migration replay into a new isolated database and an idempotent second run;
- logical backup, hash verification, isolated restore, row-count and ledger-key checks;
- Redis Consumer Group ACK, PEL reclaim, DLQ and MySQL-backed idempotent rebuild;
- Outbox claim, lease, retry, dead-letter, dispatch and payment-event behavior;
- Outbox and Redis Stream storage/backlog capacity signals.

It does not use a real Provider, deploy an environment, touch production data,
or grant production readiness. Evidence always records `productionReady=false`.

## Preconditions

- Docker Desktop is running.
- `xlb-mysql-local` and `xlb-redis-local` are healthy.
- Workspace dependencies are installed and the backend dependency graph builds.
- The source database is the local development database only.

## Static gate

```powershell
pnpm gate:stage4a
```

This parses the PowerShell entrypoints, checks migration integrity and migration
runtime controls, runs the focused Stage 2C/4A unit tests, and builds the backend.

## Local drill

```powershell
pnpm drill:stage4a
```

The drill performs these steps:

1. Creates a database named `xlb_stage4a_migration_*`.
2. Runs every repository migration with the canonical migration CLI.
3. Verifies version count, uniqueness, checksums, execution history and latest version.
4. Runs the migration CLI a second time and requires an empty `applied` result.
5. Seeds only the isolated database.
6. Starts a temporary `xlb-stage4a-redis-*` container with AOF enabled.
7. Runs Redis recovery and Outbox integration tests against the isolated resources.
8. Runs the existing logical backup/isolated restore/capacity drill against `xlb_local`.
9. Removes the temporary Redis container and isolated database in `finally`.

The default Stage 4A run permits unrelated local writers to remain active. In
that mode, the dump is transaction-consistent and source-count drift is
recorded rather than treated as corruption. A maintenance-window drill may
pass `-ConfirmWritersQuiesced` directly to the Stage 2C-4 runner to require
exact source/restored counts.

Evidence is written below `.artifacts/stage4a/` and `.artifacts/stage2c4/`.
Both directories are ignored by Git. Raw backup SQL is deleted by default.

## Safety boundaries

- Migration replay rejects targets without the `xlb_stage4a_migration_*` prefix.
- Restore continues to reject targets without the `xlb_restore_drill_*` prefix.
- The drill never points the canonical migration CLI at `xlb_local` or `xlb_staging`.
- The local source database is read by `mysqldump` and capacity queries only.
- The temporary Redis container is independent of `xlb-redis-local`; destructive
  test cleanup therefore cannot flush the developer Redis instance.
- No Provider credentials, external calls, push, deploy or production operation occur.

## Acceptance

Stage 4A local evidence passes only when:

- every candidate migration is applied exactly once with a checksum;
- the second migration run applies nothing;
- backup and restore counts match and ledger duplicate-key count is zero;
- Redis ACK/reclaim/DLQ/rebuild tests pass;
- Outbox concurrency, lease, retry, dead-letter and dispatch lifecycle tests pass;
- backup/restore timing and storage envelopes remain within configured drill limits;
- all temporary resources are removed.

This is not the Stage 4 final release acceptance. Production backup custody,
continuous binlog shipping/PITR, managed Redis topology and approved RPO/RTO
remain external production blockers.
