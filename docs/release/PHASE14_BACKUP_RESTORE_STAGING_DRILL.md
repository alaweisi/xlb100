# Phase 14 Backup Restore Staging Drill

## Decision

- Blocker: `PROD-OPS-004`
- Result: PASS
- Drill type: staging backup plus isolated restore verification
- Production release approved by this document: No
- Production deploy approved by this document: No
- Production tag approved by this document: No
- Schema changes made by this drill: No
- Active staging restored over by this drill: No

This drill proves that the current staging database can be backed up and restored into an isolated temporary database for verification. It does not replace production database provisioning, production secrets, production backup scheduling, production restore drills, release-window replay proof, or release-owner approval.

## Operator And Timestamp

| Field | Value |
| --- | --- |
| Owner | DBA / SRE owner for `PROD-OPS-004` |
| Operator | Codex on `G:\xlb100` |
| Drill timestamp UTC | `2026-07-06T02:13:09Z` |
| Drill timestamp local | `2026-07-06T10:13:09+08:00` |
| Source database | `xlb_staging` in `xlb-mysql-staging` |
| Restore target | Temporary database `xlb_staging_restore_drill_20260706T021309Z` in `xlb-mysql-staging` |
| Restore target cleanup | Dropped after verification |

## Preconditions

Staging health was confirmed before the backup and restore drill:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
scripts\smoke-staging.ps1
```

Observed result:

- `xlb-mysql-staging` was `Up` and `healthy`.
- `xlb-redis-staging` was `Up` and `healthy`.
- Backend, customer, worker, and admin staging services were up.
- `scripts\smoke-staging.ps1` returned `smoke-staging: passed`.

The requested repo scripts `deploy/backup/backup-db.ps1` and `deploy/backup/restore-db.ps1` do not exist at this baseline. The drill used direct Docker/MySQL commands against the staging compose service.

## Backup Evidence

| Field | Value |
| --- | --- |
| Backup artifact manifest | `docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.MANIFEST.md` |
| Raw backup artifact | `docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql` generated during drill, then removed from git after evidence hygiene audit |
| Backup size | `840622` bytes |
| Backup SHA-256 | `73AC8FB9CC6CFD945FC957111DD7059D856904D1261C6D2928CE7AFDF777AF59` |
| Backup last write UTC | `2026-07-06T02:13:10Z` |
| Evidence log | `docs/release/evidence/PHASE14_BACKUP_RESTORE_STAGING_DRILL_20260706T021309Z.log` |

Backup command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -T mysql sh -c "MYSQL_PWD=*** mysqldump -uxlb --single-transaction --set-gtid-purged=OFF --no-tablespaces --routines --triggers --events xlb_staging > /tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql"
docker cp <mysql-container-id>:/tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -T mysql rm -f /tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
```

Backup artifact verification:

```powershell
Get-Item docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
Get-FileHash -Algorithm SHA256 docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
```

Observed result:

- File exists: yes.
- File is non-empty: yes.
- Size: `840622` bytes.
- SHA-256: `73AC8FB9CC6CFD945FC957111DD7059D856904D1261C6D2928CE7AFDF777AF59`.
- Raw SQL repository retention after hygiene audit: removed; manifest retained.

## Restore Evidence

Restore command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -e MYSQL_PWD=*** -T mysql mysql -uroot -e "DROP DATABASE IF EXISTS xlb_staging_restore_drill_20260706T021309Z; CREATE DATABASE xlb_staging_restore_drill_20260706T021309Z CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
docker cp docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql <mysql-container-id>:/tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -T mysql sh -c "MYSQL_PWD=*** mysql -uroot --default-character-set=utf8mb4 xlb_staging_restore_drill_20260706T021309Z < /tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql"
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -T mysql rm -f /tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
```

Restore target cleanup:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -e MYSQL_PWD=*** -T mysql mysql -uroot -e "DROP DATABASE xlb_staging_restore_drill_20260706T021309Z;"
```

Post-cleanup verification:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -e MYSQL_PWD=*** -T mysql mysql -uroot --batch --raw -N -e "SELECT SCHEMA_NAME FROM information_schema.schemata WHERE SCHEMA_NAME IN ('xlb_staging','xlb_staging_restore_drill_20260706T021309Z') ORDER BY SCHEMA_NAME;"
```

Observed result:

```text
xlb_staging
```

This confirms the active staging database remained present and the temporary restore database was removed after verification.

## Verification Queries

Required table verification:

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema='xlb_staging_restore_drill_20260706T021309Z'
  AND table_name IN (
    'schema_migrations',
    'orders',
    'payment_orders',
    'event_outbox',
    'ledger_accounts',
    'ledger_entries',
    'ledger_accruals',
    'aftersale_refund_requests',
    'settlement_action_governance_intents',
    'settlement_action_governance_reviews',
    'settlement_action_governance_evidence_bundles',
    'settlement_action_governance_readiness_packets'
  )
ORDER BY table_name;
```

Observed restored tables:

```text
aftersale_refund_requests
event_outbox
ledger_accounts
ledger_accruals
ledger_entries
orders
payment_orders
schema_migrations
settlement_action_governance_evidence_bundles
settlement_action_governance_intents
settlement_action_governance_readiness_packets
settlement_action_governance_reviews
```

Required row-count verification:

```sql
SELECT 'orders' AS table_name, COUNT(*) AS row_count FROM xlb_staging_restore_drill_20260706T021309Z.orders
UNION ALL SELECT 'payment_orders', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.payment_orders
UNION ALL SELECT 'event_outbox', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.event_outbox
UNION ALL SELECT 'ledger_entries', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.ledger_entries
UNION ALL SELECT 'ledger_accruals', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.ledger_accruals
UNION ALL SELECT 'aftersale_refund_requests', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.aftersale_refund_requests
UNION ALL SELECT 'settlement_action_governance_intents', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.settlement_action_governance_intents
UNION ALL SELECT 'settlement_action_governance_reviews', COUNT(*) FROM xlb_staging_restore_drill_20260706T021309Z.settlement_action_governance_reviews
ORDER BY table_name;
```

Observed row counts:

| Table | Restored row count |
| --- | ---: |
| `aftersale_refund_requests` | 2 |
| `event_outbox` | 86 |
| `ledger_accounts` | 6 |
| `ledger_accruals` | 4 |
| `ledger_entries` | 18 |
| `orders` | 5 |
| `payment_orders` | 5 |
| `schema_migrations` | 26 |
| `settlement_action_governance_evidence_bundles` | 0 |
| `settlement_action_governance_intents` | 3 |
| `settlement_action_governance_readiness_packets` | 0 |
| `settlement_action_governance_reviews` | 3 |

Refund/reversal/audit verification:

```sql
SELECT COUNT(*) AS table_count
FROM information_schema.tables
WHERE table_schema='xlb_staging_restore_drill_20260706T021309Z';

SELECT version
FROM xlb_staging_restore_drill_20260706T021309Z.schema_migrations
WHERE version='027_aftersale_refund_reversal';

SELECT source_type, COUNT(*) AS row_count
FROM xlb_staging_restore_drill_20260706T021309Z.ledger_entries
WHERE source_type='refund.approved'
GROUP BY source_type;

SELECT event_type, COUNT(*) AS row_count
FROM xlb_staging_restore_drill_20260706T021309Z.event_outbox
WHERE event_type IN ('refund.approved','conflict_audit')
GROUP BY event_type
ORDER BY event_type;
```

Observed result:

| Check | Result |
| --- | --- |
| Restored table count | 42 |
| Migration 027 version row | `027_aftersale_refund_reversal` |
| `ledger_entries.source_type='refund.approved'` | 6 rows |
| `event_outbox.event_type='refund.approved'` | 2 rows |
| `event_outbox.event_type='conflict_audit'` | 48 rows |

## Active Staging Safety Check

After the restore target was dropped, active staging smoke was run again:

```powershell
scripts\smoke-staging.ps1
```

Observed result:

- Backend health: PASS.
- Backend DB health: PASS.
- Customer app: PASS.
- Worker app: PASS.
- Admin app: PASS.
- Script result: `smoke-staging: passed`.

## Evidence Hygiene

Follow-up audit result: the raw SQL artifact is not retained in git. It contained staging-only data, but it was still a full database dump with synthetic customer identifiers, worker identifiers, mock provider trade numbers, ledger/refund rows, and masked worker phone values. The repository now retains only a manifest, checksum, size, command shape, row-count verification, and the safe drill log.

Sensitive scan summary:

- Private keys: none found.
- Real email addresses: none found.
- Real phone numbers: none found; only masked demo worker phone values were present.
- Live payment credentials: none found; mock provider trade numbers were present.
- Production-looking hostnames or production DB data: none found.
- Decision: raw SQL dump removed from current repo; future `docs/release/evidence/*.sql` artifacts are ignored.

## Rollback Relevance

This drill closes the staging-drill evidence gap for `PROD-OPS-004` because it proves:

- A staging database backup can be produced from the running staging MySQL service.
- The backup artifact is concrete, reviewable, and non-empty.
- The backup can be restored into an isolated temporary database without overwriting active staging.
- Core order, payment, `event_outbox`, ledger, refund/reversal, and audit/governance tables are restorable.
- Migration 027 and refund/reversal audit evidence survive restore.
- Active staging remains healthy after the drill.

This does not approve production release. Production still requires production secrets, production DB provisioning, production monitoring, release-window replay/immutability proof, CI gate audit signoff, operator/app onboarding signoff, and release-owner approval.

## Final Result

`PROD-OPS-004` result: PASS for staging backup/restore drill evidence.
