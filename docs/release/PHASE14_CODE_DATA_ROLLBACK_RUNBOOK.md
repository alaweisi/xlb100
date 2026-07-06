# Phase 14 Code And Data Rollback Runbook

## Decision

- Blocker: `PROD-OPS-006`
- Scope: Phase 14R production code/data rollback procedure for refund reversal release incidents.
- Production-safe data rollback before live traffic: restore from approved pre-cut backup.
- Production-safe data rollback after live traffic: preserve financial history and forward-fix.
- Production deploy approved by this document: No.
- Production tag approved by this document: No.

This runbook is documentation-only. It does not change application code, business logic, ledger logic, replay logic, audit logic, database schema, CI gates, deployment scripts, or production state.

## Known Repository Constraints

- Staging compose exists at `deploy/compose/docker-compose.staging.yml`.
- Production compose currently contains no services: `deploy/compose/docker-compose.prod.yml`.
- Staging helpers exist: `scripts/migrate-staging.ps1`, `scripts/seed-staging.ps1`, and `scripts/smoke-staging.ps1`.
- The requested inspection found no repo files at `scripts/rollback.ps1`, `deploy/staging/rollback-staging.ps1`, `deploy/production/rollback-prod.ps1`, `deploy/backup/backup-db.ps1`, or `deploy/backup/restore-db.ps1`.

Because production deployment tooling is not present in this repo, the executable production rollback must use the approved external deployment platform or a separately approved Ops procedure. The repository evidence required here is the exact rollback decision path, commands/checks, data handling rules, and evidence requirements.

## Rollback Trigger Conditions

Start rollback assessment immediately if any of these occur during the production release window:

- Health or DB health checks fail after cutover.
- Customer, worker, or admin entrypoints fail smoke checks.
- Migration 027 fails or leaves partial schema state.
- Refund approval does not create exactly one `event_outbox` row with `event_type='refund.approved'`.
- `refund.approved` events remain pending beyond the approved production lag threshold.
- A published `refund.approved` event does not produce the expected reversal ledger entries.
- Duplicate reversal ledger entries appear for one refund/source/account/direction.
- Reversal directions differ from expected customer credit, platform debit, and worker debit.
- Conflict/audit evidence for reversal ledger entries is missing.
- `npx pnpm preflight` fails replay or immutability checks before or after cutover.
- Backend 5xx rate, database errors, or operator-impacting errors exceed the release-owner threshold.
- Security, DBA, ledger, or release owner orders a release stop.

## Approval And Communication Steps

1. Release owner declares `ROLLBACK ASSESSMENT STARTED` in the release channel.
2. SRE/Ops owner freezes additional production changes and captures current image digest, git commit, traffic state, and database timestamp.
3. DBA owner captures current DB evidence before any restore or forward-fix.
4. Ledger owner reviews `event_outbox`, `ledger_entries`, replay, immutability, and audit evidence before any data action.
5. Release owner chooses one path:
   - app-image rollback only;
   - app-image rollback plus pre-traffic database restore;
   - no rollback, forward-fix;
   - abort rollback and continue monitoring.
6. Release owner communicates final decision, owner, executor, start time, expected user impact, and evidence path.
7. Release owner declares `ROLLBACK COMPLETE`, `FORWARD-FIX ACTIVE`, or `ROLLBACK ABORTED` after verification.

## App Image And Git Tag Rollback Procedure

The previous production image digest and previous production git tag must be recorded before cutover. Do not use RC1 as the functional refund/reversal rollback target because the Phase 14 production triage records RC1 as known bad for refund reversal.

Required pre-cut inventory:

| Artifact | Required value |
| --- | --- |
| Current production git tag | Previous approved production tag, not the staging RC2 tag. |
| Current production git commit | Exact commit hash serving production before cutover. |
| Current backend image digest | Immutable image digest from the registry. |
| Current customer image digest | Immutable image digest from the registry. |
| Current worker image digest | Immutable image digest from the registry. |
| Current admin image digest | Immutable image digest from the registry. |
| Intended release commit | Commit being cut to production. |
| Intended release image digests | Backend, customer, worker, and admin digests. |

Rollback execution, using the approved production deployment platform:

```powershell
# Record the target rollback artifacts in the release evidence packet first.
$env:ROLLBACK_GIT_TAG = "<previous-production-tag>"
$env:ROLLBACK_BACKEND_IMAGE = "<backend-image-digest>"
$env:ROLLBACK_CUSTOMER_IMAGE = "<customer-image-digest>"
$env:ROLLBACK_WORKER_IMAGE = "<worker-image-digest>"
$env:ROLLBACK_ADMIN_IMAGE = "<admin-image-digest>"

# Execute the platform-specific production rollback outside this repo.
# Required evidence: command, operator, timestamp, old digest, new digest, and rollout status.
```

After image rollback, run smoke and data checks from this runbook. If production tooling later adds a repo script, it must preserve these evidence requirements and must not weaken ledger/replay/audit gates.

## Database Backup And Restore Procedure

Before cutover, DBA must create an approved backup or managed DB snapshot and record it in the release packet. This is a hard prerequisite for production release and is separate from the `PROD-OPS-004` restore-drill blocker.

Backup command shape when using CLI backup:

```powershell
mysqldump --single-transaction --set-gtid-purged=OFF --routines --triggers --events -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE > .\backups\prod-pre-phase14r.sql
```

Restore command shape when release owner and DBA approve restore:

```powershell
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE < .\backups\prod-pre-phase14r.sql
```

Restore is allowed only when the selected backup point is before live traffic or when DBA and release owner explicitly approve a full environment restore with documented user impact. If live refund, reversal, ledger, or audit data exists after the backup point, prefer forward-fix. Do not manually delete `aftersale_refund_requests`, `event_outbox`, `ledger_entries`, or audit evidence after live traffic.

## Event Outbox, Ledger, And Refund Consistency Checks

Run before rollback decision, after image rollback, and after any DB restore or forward-fix. Replace connection variables with approved production secret manager values.

```powershell
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT status, COUNT(*) FROM aftersale_refund_requests GROUP BY status;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT event_type, status, COUNT(*) FROM event_outbox WHERE event_type='refund.approved' GROUP BY event_type, status;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT aggregate_id, COUNT(*) AS event_count FROM event_outbox WHERE event_type='refund.approved' GROUP BY aggregate_id HAVING COUNT(*) > 1;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT source_type, account_type, direction, COUNT(*) FROM ledger_entries WHERE source_type='refund.approved' GROUP BY source_type, account_type, direction;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT source_id, account_type, direction, COUNT(*) AS duplicate_count FROM ledger_entries WHERE source_type='refund.approved' GROUP BY source_id, account_type, direction HAVING COUNT(*) > 1;"
mysql -h $env:PROD_MYSQL_HOST -P $env:PROD_MYSQL_PORT -u $env:PROD_MYSQL_USER -p $env:PROD_MYSQL_DATABASE --batch --raw -e "SELECT COUNT(*) AS missing_approval_event FROM aftersale_refund_requests r LEFT JOIN event_outbox e ON e.event_id = r.approval_event_id WHERE r.status='approved' AND e.event_id IS NULL;"
```

Expected result:

- No duplicate `refund.approved` events per refund aggregate.
- No duplicate reversal ledger rows per `source_id`, `account_type`, and `direction`.
- Approved refund requests have an approval event.
- Reversal direction counts match the release evidence model.
- Any nonzero missing or duplicate count is a rollback abort condition unless the ledger owner approves a forward-fix plan.

## Smoke Commands After Rollback

Run repository validation from the rollback commit or release candidate checkout:

```powershell
npx pnpm typecheck
npx pnpm test -- --bail=1 --reporter=verbose
npx pnpm preflight
```

For staging verification or production-like local verification, use:

```powershell
scripts\smoke-staging.ps1
```

For production, the same smoke surfaces must be checked against production hostnames after traffic is shifted:

```powershell
Invoke-WebRequest -Uri "https://<prod-backend-host>/health" -UseBasicParsing -TimeoutSec 10
Invoke-WebRequest -Uri "https://<prod-backend-host>/api/system/db-health" -UseBasicParsing -TimeoutSec 10
Invoke-WebRequest -Uri "https://<prod-customer-host>/" -UseBasicParsing -TimeoutSec 10
Invoke-WebRequest -Uri "https://<prod-worker-host>/" -UseBasicParsing -TimeoutSec 10
Invoke-WebRequest -Uri "https://<prod-admin-host>/" -UseBasicParsing -TimeoutSec 10
```

## Replay And Immutability Gate Timing

Run replay and immutability gates through `npx pnpm preflight` at these points:

| Timing | Required action |
| --- | --- |
| Immediately before production cut | Must PASS before traffic shift. |
| Immediately after production cut | Must PASS before declaring release healthy. |
| Before rollback execution if rollback is not an emergency traffic stop | Capture current failure evidence. |
| Immediately after app image rollback | Must PASS before declaring rollback healthy. |
| Immediately after DB restore or forward-fix | Must PASS before ending incident mode. |

If replay or immutability fails, do not delete or rewrite ledger/audit history. Preserve evidence and use a ledger-owner-approved forward-fix.

## Rollback Abort Conditions

Abort destructive rollback and switch to forward-fix when any of these are true:

- Production traffic has written refund request, refund approval, `refund.approved`, ledger reversal, or conflict/audit rows after the backup point.
- The only available rollback target is RC1 or another commit known to fail refund/reversal behavior.
- The previous image digest or previous production commit cannot be proven.
- The pre-cut backup cannot be verified or the restore target is ambiguous.
- DBA owner does not approve restore.
- Ledger owner does not approve the planned treatment of `event_outbox`, `ledger_entries`, replay, or immutability evidence.
- Rollback smoke fails and the failure is worse than the active incident.
- Production secrets, domain, ingress, or DB target cannot be confirmed.

## Exact Evidence Required To Mark PROD-OPS-006 PASS

`PROD-OPS-006` can be marked PASS when the release packet links all of the following:

- This document: `docs/release/PHASE14_CODE_DATA_ROLLBACK_RUNBOOK.md`.
- The app image and git tag rollback procedure from this document.
- The DB backup and restore procedure from this document.
- The `event_outbox`, ledger, and refund consistency checks from this document.
- The post-rollback smoke commands from this document.
- The replay and immutability timing requirements from this document.
- Communication, approval, and rollback abort conditions from this document.
- The explicit repository constraint that production rollback and backup scripts are absent and production execution must use approved external deployment/DB tooling until such scripts are created and reviewed.

Concrete production environment execution evidence is still required by separate production blockers such as `PROD-OPS-001`, `PROD-OPS-002`, `PROD-OPS-003`, `PROD-OPS-004`, `PROD-OPS-010`, and `PROD-OPS-013`. This PASS closes the repo-documentable code/data rollback runbook blocker only.
