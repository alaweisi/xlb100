# Stage 2C-4 disaster recovery and capacity runbook

## Scope and truth

Stage 2C-4 supplies repeatable local/staging evidence for MySQL logical backup,
isolated restore, schema/data verification, Redis rebuild readiness, and bounded
Outbox/Stream capacity. It does not authorize deployment or production restore.

The drill always restores into a database named `xlb_restore_drill_*`; the
restore script rejects any other target. It never overwrites `xlb_local`,
`xlb_staging`, or an operator-supplied production database.

## Commands

Static and code gate:

```powershell
pnpm gate:stage2c4
```

Local real backup/restore/capacity drill:

```powershell
pnpm drill:stage2c4
```

Staging drill requires explicit credentials and a quiesced writer window:

```powershell
$env:MYSQL_PASSWORD = '<secret-manager value>'
pnpm drill:stage2c4 -- -Environment staging
```

Evidence is written below `.artifacts/stage2c4/`, which is ignored by Git.
The raw SQL artifact is deleted by default; use `-KeepBackupArtifact` only for
an approved local/staging evidence window and remove it after review.

The first repository-local full-size execution and its non-production verdict
are recorded in `STAGE2C4_LOCAL_DRILL_RESULT.md`.

## Acceptance matrix

| Area | Automated evidence | Pass condition |
| --- | --- | --- |
| Backup | SHA-256 manifest, size, duration, critical-table counts | non-empty single-transaction dump within 900 seconds |
| Restore | isolated target, hash verification, row-count comparison | exact critical counts and latest migration |
| Ledger | restored duplicate scan | zero duplicate `(account, source type, source id, direction)` keys |
| Cleanup | `finally` target removal | no retained target unless explicit `-KeepTarget` |
| Capacity | Outbox rows/bytes and Redis XLEN | under configured storage envelopes |
| Redis recovery | MySQL-authoritative runId rebuild tests | bounded stream and idempotent rebuild pass |
| RPO/PITR | MySQL binlog settings recorded | capability visible; production schedule still separately required |
| RTO | backup/restore timers | within configured local/staging thresholds |

## Defaults

- Outbox hard envelope: 2,000,000 rows or 2 GiB.
- Redis city dispatch stream hard envelope: 250,000 entries, matching bounded
  `XADD MAXLEN` in the publisher.
- Operational backlog health: oldest eligible pending/retry row no older than
  300 seconds. This is reported separately from storage capacity so a large but
  bounded queue cannot be mistaken for a healthy consumer loop.
- Backup RTO evidence threshold: 900 seconds.
- Restore RTO evidence threshold: 1,800 seconds.

Thresholds are drill parameters, not a production SLA. Production targets need
service-owner approval and managed-database evidence.

## Recovery sequence

1. Stop or quiesce writers. A logical dump is transaction-consistent, but exact
   manifest count comparison assumes no business writes between dump and count
   capture.
2. Run the backup and retain its manifest/hash outside Git.
3. Restore only into an isolated target and verify migrations, critical table
   counts, and ledger uniqueness.
4. Start MySQL-backed jobs first. Redis remains an acceleration layer.
5. Rebuild each city stream from authoritative active `dispatch_tasks` with one
   stable runId; repeated execution is idempotent.
6. Start Consumer Groups, inspect PEL/ACK/DLQ metrics, then resume traffic.

## Production blockers intentionally left open

The local/staging drill cannot prove:

- approved production backup schedule and retention;
- off-host encrypted artifact custody;
- continuous binlog shipping and point-in-time recovery;
- production restore credentials, owner, maintenance window, or user impact;
- managed Redis topology or production capacity;
- a production RPO/RTO commitment.

Those items remain production NO-GO until operator evidence is supplied. The
drill summary therefore always records `productionReady=false` and
`pitrScheduledAndProven=false`.
