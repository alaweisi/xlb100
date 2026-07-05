# Phase 14 RC2 Internal Beta Day 0 Evidence

## Baseline

- RC2 tag: `phase14-staging-rc2`
- RC2 tagged commit: `ae4f5d1 docs(release): add phase 14 rc2 uat evidence`
- Current commit: `77c8c62 docs(release): add phase 14 rc2 internal beta handoff`
- Branch: `phase14r-refund-reversal`
- Evidence date: 2026-07-05
- Production release status: BLOCKED

## Git confirmation

- Working tree before Day 0 evidence: clean
- Latest commits confirmed:
  - `77c8c62 docs(release): add phase 14 rc2 internal beta handoff`
  - `ae4f5d1 docs(release): add phase 14 rc2 uat evidence`
  - `60ba210 chore(ci): allow phase 14r refund reversal gates`
  - `0f0f26d fix(ledger): implement refund reversal mvp`
  - `ce5e341 docs(release): record rc1 refund reversal blocker`
- `git tag --points-at HEAD`: no tag points at current handoff commit; RC2 tag remains `phase14-staging-rc2` on the RC2 evidence commit.

## Staging status

Command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
```

Result: PASS

Containers:

| Service | Container | Status | Port |
| --- | --- | --- | --- |
| mysql | `xlb-mysql-staging` | Up, healthy | `3307->3306` |
| redis | `xlb-redis-staging` | Up, healthy | `6380->6379` |
| backend | `xlb-backend-staging` | Up | `3000->3000` |
| customer | `xlb-customer-staging` | Up | `4173->4173` |
| worker | `xlb-worker-staging` | Up | `4174->4173` |
| admin | `xlb-admin-staging` | Up | `4175->4173` |

## Smoke result

Command:

```powershell
scripts\smoke-staging.ps1
```

Result: PASS

Checks passed:

- Backend health: `http://localhost:3000/health`
- Backend DB health: `http://localhost:3000/api/system/db-health`
- Customer app: `http://localhost:4173/`
- Worker app: `http://localhost:4174/`
- Admin app: `http://localhost:4175/`

## Log inspection summary

Command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml logs --tail=200
```

Result: PASS with non-blocking observations.

Observed normal/expected entries:

- Backend health and DB health returned HTTP 200.
- Customer, worker, and admin static app requests returned HTTP 200.
- RC2 UAT flow endpoints returned HTTP 200 for order, payment, dispatch, worker fulfillment, refund approval, ledger reversal, and audit trail checks.
- Intentional negative city-scope checks returned HTTP 403/404 during UAT; these are expected guard validations, not runtime blockers.

Non-blocking warnings:

- Frontend containers logged update-check warnings.
- MySQL startup logged insecure initialization/timezone-file warnings typical of local staging container bootstrap.
- No backend 5xx responses observed in the inspected tail.
- No container crash/restart observed in `ps` output.

## Beta start decision

Decision: START Phase 14 RC2 staging internal beta Day 0.

Rationale:

- Staging containers are running.
- Smoke is PASS.
- Logs show no obvious runtime crash or 5xx blocker.
- RC2 full UAT is already PASS: 11 PASS / 0 FAIL / 0 NOT RUN.
- Validation remains required after this document before committing Day 0 evidence.

Production release remains BLOCKED.

## Watch items

- Refund duplicate approval.
- Duplicate reversal prevention.
- Reversal amount direction.
- `event_outbox` `refund.approved` rows.
- Ledger replay.
- Audit trace.

## Escalation rule

Stop internal beta and escalate if any of these occur:

- Smoke fails.
- Backend emits 5xx on order, payment, dispatch, worker fulfillment, refund approval, ledger reversal, or audit trail endpoints.
- A refund approval creates duplicate `refund.approved` events.
- A `refund.approved` event does not produce deterministic reversal ledger entries.
- Reversal directions differ from customer credit, platform debit, worker debit.
- Ledger replay or immutability fails.
- Reversal ledger entries are missing `conflict_audit` traces.
