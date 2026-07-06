# Phase 14 Migration 027 Rollback Plan

## Decision

- Blocker: `PROD-OPS-005`
- Migration: `db/migrations/027_aftersale_refund_reversal.sql`
- Table introduced: `aftersale_refund_requests`
- Production-safe rollback mode before live traffic: restore the pre-cut database backup.
- Production-safe rollback mode after live traffic: forward-fix only.
- Destructive down migration after live traffic: not allowed.
- Production deploy approved by this document: No.
- Production tag approved by this document: No.

This plan is documentation-only. It does not change schema, business logic, ledger logic, replay logic, audit logic, CI gates, or deployment state.

## Migration Purpose

Migration 027 creates the refund request persistence foundation for Phase 14R aftersale refund reversal work. It stores one refund request per order and links the request to the city, order, payment order, and fulfillment that produced the refund approval and reversal flow.

The migration also records `027_aftersale_refund_reversal` in `schema_migrations` so the migration runner can skip it after it has been applied.

## Affected Objects

| Object | Change |
| --- | --- |
| `aftersale_refund_requests` | New InnoDB table with `utf8mb4_unicode_ci` collation. |
| `schema_migrations` | Inserts version row `027_aftersale_refund_reversal` with `ON DUPLICATE KEY UPDATE version=version`. |

## Affected Columns

| Column | Definition | Rollback relevance |
| --- | --- | --- |
| `refund_id` | `VARCHAR(64) NOT NULL PRIMARY KEY` | Primary identifier. Do not delete after live traffic. |
| `city_code` | `VARCHAR(64) NOT NULL` | Required city scope and FK to `cities(city_code)`. |
| `order_id` | `VARCHAR(64) NOT NULL` | FK to `orders(order_id)` and part of one-refund-per-order uniqueness. |
| `customer_id` | `VARCHAR(64) NOT NULL` | Customer reference captured for refund request review. |
| `fulfillment_id` | `VARCHAR(64) NOT NULL` | FK to `fulfillments(fulfillment_id)`. |
| `payment_order_id` | `VARCHAR(64) NOT NULL` | FK to `payment_orders(payment_order_id)`. |
| `amount` | `DECIMAL(10,2) NOT NULL` | Financial amount. Preserve after live traffic. |
| `currency` | `VARCHAR(16) NOT NULL DEFAULT 'CNY'` | Constrained to `CNY`. |
| `reason` | `VARCHAR(255) NULL` | Operator/customer reason text. |
| `status` | `VARCHAR(32) NOT NULL DEFAULT 'requested'` | Refund request lifecycle state. |
| `requested_at` | `TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP` | Request creation timestamp. |
| `approved_at` | `TIMESTAMP NULL` | Approval timestamp. |
| `approved_by_admin_id` | `VARCHAR(64) NULL` | Approval operator reference. |
| `approval_event_id` | `VARCHAR(64) NULL` | Links approved request to the emitted approval event. |

## Affected Constraints And Indexes

| Name | Type | Definition |
| --- | --- | --- |
| `PRIMARY` | Primary key | `refund_id` |
| `fk_refund_requests_city` | Foreign key | `city_code` references `cities(city_code)` |
| `fk_refund_requests_order` | Foreign key | `order_id` references `orders(order_id)` |
| `fk_refund_requests_payment` | Foreign key | `payment_order_id` references `payment_orders(payment_order_id)` |
| `fk_refund_requests_fulfillment` | Foreign key | `fulfillment_id` references `fulfillments(fulfillment_id)` |
| `chk_refund_requests_city` | Check | `city_code <> '__global__'` |
| `chk_refund_requests_amount` | Check | `amount >= 0` |
| `chk_refund_requests_currency` | Check | `currency = 'CNY'` |
| `uk_refund_requests_order` | Unique key | `(city_code, order_id)` |
| `uk_refund_requests_approval_event` | Unique key | `(approval_event_id)` |
| `idx_refund_requests_city` | Secondary index | `(city_code)` |
| `idx_refund_requests_status` | Secondary index | `(status)` |
| `idx_refund_requests_fulfillment` | Secondary index | `(fulfillment_id)` |

## Destructive Down Migration Policy

There is no approved destructive down migration for production.

`DROP TABLE aftersale_refund_requests`, deleting the `schema_migrations` row, or deleting refund/reversal rows is allowed only in disposable local or staging reset flows. It is not an approved production rollback after live traffic.

Explicit warning: do not delete ledger, reversal, refund, event, or audit financial history after live traffic. `ledger_entries`, `event_outbox`, and conflict/audit evidence are financial and operational history. They must be preserved and corrected by forward-fix or by whole-database restore only when the restore point is before live traffic.

## Preferred Rollback Strategy

| Scenario | Strategy | Reason |
| --- | --- | --- |
| Production cut fails before any live traffic reaches the new build and before any refund/reversal writes occur | Restore from the verified pre-cut backup or managed database snapshot. | Restores schema and data atomically to the exact pre-cut state. |
| Production cut fails after live traffic has written refund request, refund approval, `refund.approved`, ledger reversal, or audit data | Forward-fix. Do not drop migration 027 or delete financial history. | Preserves immutable financial history and avoids data loss or replay/audit gaps. |
| Migration 027 fails during apply before serving traffic | Stop cutover, restore from pre-cut backup if the DB is partially modified, keep old app image serving traffic. | Prevents partial schema from being treated as production-ready. |
| App rollback is required but migration 027 applied successfully and no live refund data exists | Prefer restore from pre-cut backup. If restore is not used, leave the unused table in place and document the state. | Leaving an unused additive table is safer than destructive table removal without a restore point. |

## Pre-Cut Backup Requirement

Before applying migration 027 in production, the DBA owner must produce a reviewable backup artifact:

- Backup timestamp in UTC.
- Git commit and intended release image digest.
- Database host, schema name, and replication/snapshot identifier.
- Backup method: managed DB snapshot or `mysqldump --single-transaction`.
- Restore target and restore command or console action.
- Checksum, size, or provider snapshot ID.
- DBA owner signoff that restore is possible within the declared RTO.

If using CLI backup instead of a managed snapshot, use production secrets from the approved secret manager, not repo example values:

```powershell
mysqldump --single-transaction --set-gtid-purged=OFF --routines --triggers --events -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE > .\backups\prod-pre-phase14r-027.sql
```

The requested inspection found no repo scripts at `deploy/backup/backup-db.ps1` or `deploy/backup/restore-db.ps1`. Production backup and restore execution must therefore use the approved managed DB tooling or explicit DBA commands recorded in the release evidence packet. This does not close `PROD-OPS-004`; restore drill evidence remains separate.

## Post-Cut Verification Commands

Run these checks against the production database after migration 027 and again after any rollback or forward-fix decision. Replace connection variables with approved production secret manager values.

```powershell
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT version FROM schema_migrations WHERE version='027_aftersale_refund_reversal';"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SHOW TABLES LIKE 'aftersale_refund_requests';"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SHOW CREATE TABLE aftersale_refund_requests\G"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT status, COUNT(*) FROM aftersale_refund_requests GROUP BY status;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT event_type, status, COUNT(*) FROM event_outbox WHERE event_type='refund.approved' GROUP BY event_type, status;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT source_type, account_type, direction, COUNT(*) FROM ledger_entries WHERE source_type='refund.approved' GROUP BY source_type, account_type, direction;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT source_type, source_id, account_type, direction, COUNT(*) AS duplicate_count FROM ledger_entries WHERE source_type='refund.approved' GROUP BY source_type, source_id, account_type, direction HAVING COUNT(*) > 1;"
```

Run repository gates from the intended release candidate before and after cutover:

```powershell
npx pnpm preflight
```

## Rollback Decision Tree

1. Did migration 027 fail before production traffic was shifted?
   - Yes: keep old app image serving traffic, restore the pre-cut backup if the database has partial 027 changes, collect schema verification output, and stop the release.
   - No: continue.
2. Did production traffic reach the new app image?
   - No: restore the pre-cut backup if full rollback is required; otherwise leave additive migration 027 in place and record that no live data was written.
   - Yes: continue.
3. Were any rows written to `aftersale_refund_requests`, any `refund.approved` events emitted, or any `ledger_entries.source_type='refund.approved'` rows written?
   - Yes: do not run destructive rollback. Preserve data and forward-fix.
   - No: restore from pre-cut backup if the release owner requires a clean rollback; do not manually drop the table unless DBA and release owner document why restore is not possible and prove zero live traffic.
4. Did replay or immutability gates fail after cutover?
   - Yes: freeze additional release changes, preserve DB state, collect `event_outbox` and `ledger_entries` evidence, and forward-fix under release-owner and ledger-owner approval.
   - No: continue normal monitoring.

## Roles

| Role | Required owner |
| --- | --- |
| Rollback owner | Release owner |
| Rollback approver | Release owner plus DBA owner; ledger owner must approve any decision involving `event_outbox`, `ledger_entries`, replay, or immutability evidence. |
| Rollback executor | DBA owner for database restore or forward-fix SQL; release engineer for app image rollback; SRE/Ops owner for traffic shift. |
| Evidence reviewer | Release owner plus DBA owner. |

## Evidence Required To Mark PROD-OPS-005 PASS

`PROD-OPS-005` can be marked PASS when the release packet links all of the following:

- This document: `docs/release/PHASE14_MIGRATION_027_ROLLBACK_PLAN.md`.
- Source migration: `db/migrations/027_aftersale_refund_reversal.sql`.
- Affected object inventory from the "Affected Objects", "Affected Columns", and "Affected Constraints And Indexes" sections.
- Explicit destructive down migration policy from this document.
- Rollback decision tree from this document.
- Pre-cut backup requirement from this document.
- Post-cut verification commands from this document.
- Named owner, approver, and executor roles from this document.

Concrete production execution evidence is still required by separate production blockers such as `PROD-OPS-003`, `PROD-OPS-004`, `PROD-OPS-010`, and `PROD-OPS-013`. This PASS closes the repo-documentable rollback-plan blocker only.
