# Phase 14 Staging DB Backup Artifact Manifest

## Artifact Identity

| Field | Value |
| --- | --- |
| Original filename | `PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql` |
| Original path during drill | `docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql` |
| Artifact type | MySQL logical dump from staging database `xlb_staging` |
| Generated at UTC | `2026-07-06T02:13:10Z` |
| Original size | `840622` bytes |
| SHA-256 | `73AC8FB9CC6CFD945FC957111DD7059D856904D1261C6D2928CE7AFDF777AF59` |
| Current repo storage | Not stored in git after hygiene audit |

## Generation Command

The backup was generated during the staging drill with this command shape. The password value is redacted in repo evidence.

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml exec -T mysql sh -c "MYSQL_PWD=*** mysqldump -uxlb --single-transaction --set-gtid-purged=OFF --no-tablespaces --routines --triggers --events xlb_staging > /tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql"
docker cp <mysql-container-id>:/tmp/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql docs/release/evidence/PHASE14_STAGING_DB_BACKUP_20260706T021309Z.sql
```

## Hygiene Decision

The raw SQL dump was removed from the repository in a follow-up commit because it contained full staging transactional rows, including synthetic customer identifiers, worker identifiers, mock provider trade numbers, ledger/refund rows, and masked worker phone values. No obvious real email address, private key, live payment credential, or production hostname was found, but a raw database dump is not appropriate long-term git evidence.

The drill remains reviewable through:

- This manifest.
- The SHA-256 checksum above.
- The non-empty artifact size above.
- The drill log `docs/release/evidence/PHASE14_BACKUP_RESTORE_STAGING_DRILL_20260706T021309Z.log`.
- The drill summary `docs/release/PHASE14_BACKUP_RESTORE_STAGING_DRILL.md`.

## Verification Summary

The raw artifact was restored into temporary database `xlb_staging_restore_drill_20260706T021309Z`, verified, and then removed from active MySQL. Active staging was not overwritten.

Verified restored evidence included:

- Restored table count: `42`.
- Required order/payment/event/ledger/refund/audit-governance tables present.
- `schema_migrations.version='027_aftersale_refund_reversal'` present.
- `ledger_entries.source_type='refund.approved'`: `6` rows.
- `event_outbox.event_type='refund.approved'`: `2` rows.
- `event_outbox.event_type='conflict_audit'`: `48` rows.
- Active staging smoke after restore: PASS.

## Retention Rule

Future SQL dump artifacts under `docs/release/evidence/` must not be committed directly. Commit a manifest, checksum, command, and verification summary instead unless a release owner explicitly approves a redacted, minimal SQL sample.
