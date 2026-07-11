# Phase 14 Internal Beta Runbook

## Scope

This runbook starts and operates the Phase 14 RC2 staging internal beta for tag `phase14-staging-rc2`.

RC2 is approved for staging internal beta only. It is not approved for production release.

## Startup commands

Run from `G:\xlb100`.

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
```

## Migration command

```powershell
scripts\migrate-staging.ps1
```

## Seed command

```powershell
scripts\seed-staging.ps1
```

## Smoke command

```powershell
scripts\smoke-staging.ps1
```

Expected smoke checks:

- Backend health: `http://localhost:3000/health`
- Backend DB health: `http://localhost:3000/api/system/db-health`
- Customer app: `http://localhost:4173/`
- Worker app: `http://localhost:4174/`
- Admin app: `http://localhost:4175/`

## UAT evidence paths

- RC2 UAT document: `docs/release/PHASE14_RC2_MANUAL_UAT.md`
- RC2 raw evidence log: `docs/release/evidence/PHASE14_RC2_UAT_20260705T152508Z.log`
- RC1 blocker summary: `docs/release/PHASE14_RC1_BLOCKER_REFUND_REVERSAL.md`
- RC1 manual UAT history: `docs/release/PHASE14_RC1_MANUAL_UAT.md`

## Rollback procedure

For staging runtime rollback, stop RC2 containers and restart the previous known-good image or commit checkout.

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml down
```

If rollback is to the RC1 code line for comparison only:

```powershell
git checkout eb96b45
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
scripts\migrate-staging.ps1
scripts\seed-staging.ps1
scripts\smoke-staging.ps1
```

Important: RC1 is known to fail refund/reversal UAT and must not be treated as a release candidate for refund reversal.

If staging data must be reset, recreate the staging database volume only after release-owner approval because it deletes beta evidence data:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml down -v
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
scripts\migrate-staging.ps1
scripts\seed-staging.ps1
scripts\smoke-staging.ps1
```

## What to monitor during beta

- `event_outbox` rows with `event_type = 'refund.approved'`.
- `event_outbox.status` transitions from `pending` to `published` for refund approval events.
- `ledger_entries` rows with `source_type = 'refund.approved'`.
- Duplicate reversal risk by grouping `ledger_entries` on `city_code`, `source_type`, `source_id`, `account_type`, `direction`.
- Reversal amount direction: customer `credit`, platform `debit`, worker `debit`.
- `conflict_audit` event_outbox rows for reversal ledger entries.
- Backend container logs for 4xx spikes, 5xx responses, and MySQL errors.
- Smoke checks for backend, DB health, customer, worker, and admin surfaces.

## Suggested beta verification commands

```powershell
scripts\smoke-staging.ps1
npx pnpm preflight
```

Optional SQL inspection inside staging MySQL:

```powershell
docker exec -e MYSQL_PWD=change-me xlb-mysql-staging mysql -uxlb xlb_staging --batch --raw -e "SELECT event_type,status,COUNT(*) FROM event_outbox WHERE event_type='refund.approved' GROUP BY event_type,status;"
docker exec -e MYSQL_PWD=change-me xlb-mysql-staging mysql -uxlb xlb_staging --batch --raw -e "SELECT source_type,account_type,direction,COUNT(*) FROM ledger_entries WHERE source_type='refund.approved' GROUP BY source_type,account_type,direction;"
```

## Blocker escalation rules

Escalate immediately and stop beta if any of these occur:

- `scripts\smoke-staging.ps1` fails.
- `npx pnpm preflight` fails replay or immutability gates.
- A refund approval does not create exactly one `refund.approved` event for the refund.
- A published `refund.approved` event has no corresponding reversal ledger entries.
- Duplicate reversal ledger entries appear for one fulfillment/source.
- Reversal directions differ from customer credit, platform debit, worker debit.
- `conflict_audit` rows are missing for reversal ledger entries.
- Backend returns 5xx for order, payment, dispatch, worker fulfillment, refund approval, or ledger reversal endpoints.
- Any schema change is proposed during beta without explicit release-owner approval.

## Beta closeout criteria

Internal beta can close only after:

- Smoke remains PASS.
- No duplicate refund approval or duplicate reversal evidence is found.
- Replay and immutability gates remain PASS.
- Beta operators sign off on customer, worker, admin, refund, reversal, and audit trace behavior.
- Production rollback plan is written and approved separately.
