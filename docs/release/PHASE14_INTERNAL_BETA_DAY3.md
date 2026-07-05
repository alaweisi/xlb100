# Phase 14 RC2 Internal Beta Day 3 Monitoring Report

## Baseline

- RC2 tag: `phase14-staging-rc2`
- Current commit: `c74b69d docs(release): add phase 14 internal beta day 2 report`
- Branch: `phase14r-refund-reversal`
- Evidence date: 2026-07-05
- Production release status: BLOCKED

## Git confirmation

- Working tree before Day 3 evidence: clean
- Latest commits confirmed:
  - `c74b69d docs(release): add phase 14 internal beta day 2 report`
  - `347551f docs(release): add phase 14 internal beta day 1 report`
  - `acfb6a2 docs(release): start phase 14 rc2 internal beta`
  - `77c8c62 docs(release): add phase 14 rc2 internal beta handoff`
  - `ae4f5d1 docs(release): add phase 14 rc2 uat evidence`
- `git tag --points-at HEAD`: no tag points at the Day 3 monitoring baseline. RC2 tag remains `phase14-staging-rc2`.

## P3 carryover summary

Day 1 and Day 2 P3 issues remain tracked with issue id, affected flow, evidence, owner, decision, and disposition. No P3 item escalated to P2/P1/P0 during Day 3 monitoring.

| Issue ID | Severity | Affected flow | Evidence | Owner | Day 3 status | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| BETA-D1-001 | P3 | Customer/worker/admin static app serving | Frontend update-check warnings; apps continue returning HTTP 200 | Release engineering | Carryover, unchanged | Deferred cleanup; not needed for beta continuation |
| BETA-D1-002 | P3 | Local staging MySQL bootstrap | MySQL timezone/insecure local bootstrap warnings; MySQL container healthy | Release engineering | Carryover, unchanged | Deferred cleanup; production hardening/compose hygiene |
| BETA-D1-003 | P3 | Admin city-scope guard negative checks | HTTP 403/404 from intentional wrong-city / missing-scope UAT checks | Backend owner | Carryover, unchanged | No fix required; keep as guard evidence |

## Staging status

Command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
```

Result: PASS

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

## Runtime log summary

Command:

```powershell
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml logs --tail=300
```

Result: LOW risk

Summary:

- No container crash or restart observed in `ps` output.
- No backend HTTP 5xx response observed in inspected logs.
- Backend health and DB health checks returned HTTP 200.
- Customer, worker, and admin static app requests returned HTTP 200.
- Order, payment, dispatch, worker fulfillment, settlement governance, certification, refund request, refund approval, ledger reversal, and audit trail paths remain represented by HTTP 200 entries in inspected logs and RC2 UAT history.
- Expected negative authorization/city-scope checks returned HTTP 403/404 during UAT history; these remain P3 guard evidence, not runtime blockers.
- Frontend update-check warnings and MySQL local bootstrap warnings remain P3/non-blocking.

## Day 3 issue table by severity

| Issue ID | Severity | Affected flow | Evidence | Owner | Decision | Disposition |
| --- | --- | --- | --- | --- | --- | --- |
| BETA-D1-001 | P3 | Customer/worker/admin static app serving | Frontend update-check warnings; apps continue returning HTTP 200 | Release engineering | Monitor only; no blocker | Deferred cleanup; not needed for beta continuation |
| BETA-D1-002 | P3 | Local staging MySQL bootstrap | MySQL timezone/insecure local bootstrap warnings; MySQL container healthy | Release engineering | Monitor only; staging-only warning | Deferred cleanup; production hardening/compose hygiene |
| BETA-D1-003 | P3 | Admin city-scope guard negative checks | HTTP 403/404 from intentional wrong-city / missing-scope UAT checks | Backend owner | Expected guard behavior; no action | No fix required; keep as guard evidence |

Issue count by severity:

| Severity | Count |
| --- | ---: |
| P0 | 0 |
| P1 | 0 |
| P2 | 0 |
| P3 | 3 |

## Watch items

| Watch item | Day 3 status | Evidence / note |
| --- | --- | --- |
| Customer order | PASS observed | Logs/UAT history include `POST /api/orders` HTTP 200 |
| Worker accept/fulfill | PASS observed | Logs/UAT history include worker accept/start/complete HTTP 200 |
| Admin review | PASS observed | Governance review approval path returned HTTP 200 after expected negative guard check |
| Refund approval | PASS observed | `POST /api/internal/aftersale/refunds/.../approve` returned HTTP 200 |
| `refund.approved` event_outbox | WATCH | Covered by RC2 UAT evidence; continue SQL monitoring during beta |
| Ledger reversal | PASS observed | `POST /api/internal/ledger/reverse` returned HTTP 200 |
| Duplicate approval prevention | WATCH | Covered by RC2 implementation/UAT; continue monitoring for duplicate events |
| Audit trace | PASS observed | Audit trail endpoint returned HTTP 200; continue conflict_audit monitoring |
| Replay gate | PASS pending validation | Must remain PASS in post-doc validation |

## Day 3 beta decision

Decision: CONTINUE Phase 14 RC2 staging internal beta.

Rationale:

- Staging containers remain running.
- Smoke remains PASS.
- Runtime log inspection found no P0/P1/P2 blocker.
- Day 1/Day 2 P3 carryovers are unchanged and remain non-blocking.
- Production release remains BLOCKED pending beta observation, rollback readiness, and release-owner approval.

## Escalation rule

Escalate immediately and stop beta if any of these occur:

- Any P0/P1 issue appears.
- Smoke fails.
- Backend emits 5xx for customer order, payment, dispatch, worker fulfillment, refund approval, ledger reversal, or audit trace flows.
- `refund.approved` event creation is missing or duplicated for one refund approval.
- Ledger reversal entries are missing, duplicated, or directionally incorrect.
- Replay or immutability gates fail.
- Reversal audit trace is missing.
