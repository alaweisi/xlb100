# Stage 2C-4 local disaster-recovery drill result

## Verdict

- Drill timestamp: `2026-07-15T15:19:46Z`
- Source: local Docker MySQL database `xlb_local`
- Result: **backup/isolated restore/verification PASS**
- Production readiness granted: **No**
- Production deployment authorized: **No**

## Measured recovery evidence

| Evidence | Result |
| --- | --- |
| Logical backup | PASS — 569,312,877 bytes |
| Backup duration | 12.452 seconds, threshold 900 seconds |
| Backup SHA-256 | `B95BC7F300B6CB8D55C327D0857AEDA07E27A60D979FEA9961B4E4EB859BFDA8` |
| Isolated target | `xlb_restore_drill_20260715_151946` |
| Restore and verification duration | 103.191 seconds, threshold 1,800 seconds |
| Latest restored migration | `058_stage2c2_migration_control` |
| Critical table counts | exact manifest match |
| Duplicate ledger unique keys | 0 |
| Target cleanup | PASS — no `xlb_restore_drill_*` database remained |
| Raw SQL cleanup | PASS — deleted after verification |

The first execution intentionally failed closed after restore when the new
verification script referenced a non-existent `ledger_entries.accrual_id`
column. Its temporary database and raw dump were still cleaned by `finally`.
The verification was corrected to the real ledger unique key
`(account_id, source_type, source_id, direction)`, and the complete drill then
passed. This failure is recorded because it proves the cleanup path as well as
the happy path.

## Capacity snapshot

| Signal | Observed | Hard envelope | Result |
| --- | ---: | ---: | --- |
| `event_outbox` rows | 762,299 | 2,000,000 | within storage envelope |
| `event_outbox` bytes | 752,025,600 | 2,147,483,648 | within storage envelope |
| Pending/retry Outbox rows | 639,254 | operational signal | unhealthy |
| Oldest eligible event | 1,043,914 seconds | 300 seconds | unhealthy |
| Hangzhou Redis stream length | 43,380 | 250,000 | within storage envelope |

This is a local/test database, not production evidence. It nevertheless proves
that a storage-capacity PASS must not hide an unhealthy consumer backlog. The
Stage 2C-1 reliability snapshot exposes the backlog/age signal, and the Stage
2C-1/2C-3 Job Worker plus Consumer Group provides the runtime that must drain it
in a controlled environment.

## Recovery capability truth

- MySQL `log_bin=1`, `binlog_format=ROW`, expiration 2,592,000 seconds.
- Continuous off-host binlog shipping and PITR were not configured or proven.
- Redis AOF was `no` in the local instance. Redis remains rebuildable, not a
  source of truth.
- A separate temporary Redis 7 protocol test passed XGROUP/XREADGROUP/XACK,
  XAUTOCLAIM, MySQL-final-failure-before-DLQ, and idempotent runId rebuild.

## Remaining production blockers

1. Approved production backup schedule, encryption and off-host retention.
2. Continuous binlog shipping plus point-in-time recovery drill.
3. Production restore owner, credentials, maintenance window and RPO/RTO SLA.
4. Controlled staging soak proving the new worker drains backlog under alert
   thresholds without overwhelming MySQL or Redis.
5. Outbox archive/purge implementation with legal hold and FK-safe retention;
   Stage 2C-3 currently supplies the catalog and eligibility policy only.
