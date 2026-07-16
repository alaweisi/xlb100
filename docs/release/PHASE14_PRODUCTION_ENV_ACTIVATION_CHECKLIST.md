# Phase 14 Production Environment Activation Checklist

## Decision

- Checklist status: PREPARED
- Production release status: NO-GO / BLOCKED
- Checklist date: 2026-07-06
- Baseline commit: `181798b docs(release): add phase 14 production evidence pack`
- Scope: documentation only; no feature, business logic, ledger/replay/audit logic, schema, CI gate, production deploy, or production tag change.

This checklist converts the remaining `PROD-OPS-*` blockers into production activation steps. It does not mark any item PASS.

## Repository Inspection Notes

| Item | Inspection result | Production impact |
| --- | --- | --- |
| `deploy/compose/docker-compose.prod.yml` | Minimal app-service scaffold exists. | Production runtime composition is repo-ready for later verification, but real production DB/Redis/ingress/secrets evidence remains required. |
| `deploy/production/deploy-prod.ps1` | Guarded deploy scaffold exists and defaults to dry run unless `-Apply` is provided. | Does not approve production deployment; release-owner approval remains required. |
| `deploy/production/smoke-prod.ps1` | Production smoke scaffold exists and reads HTTPS URLs from env/config. | Real production URLs and operator-run smoke evidence remain required. |
| `deploy/production/rollback-prod.ps1` | Guarded rollback scaffold exists and references the rollback runbook. | Does not prove rollback execution; release-window rollback evidence remains operator-owned. |
| `deploy/production/check-prod-monitoring.ps1` | Read-only production monitoring helper scaffold exists and refuses `.env.production.example`. | Does not prove production monitoring; real production dashboards, alerts, SQL output, and owner approval remain required. |
| `.env.production.example` | Placeholder-only example exists. | Must not be used as production secret evidence or production runtime env. |
| `.env.staging.example` | Exists and contains staging/example values such as `MYSQL_DATABASE=xlb_staging`, `MYSQL_PASSWORD=change-me`, and `JWT_SECRET=change-me-in-production`. | Must not be used as production evidence or production secrets. |

## Production Owner Matrix

| Area | PROD-OPS | Required owner | Evidence provider |
| --- | --- | --- | --- |
| Secrets | `PROD-OPS-001` | Security / Ops owner | Secret manager or deployment operator |
| Domain/TLS/ingress | `PROD-OPS-002` | Infra / Ops owner | DNS/TLS/ingress operator |
| Database | `PROD-OPS-003` | DBA / Ops owner | DBA or managed database operator |
| Monitoring and alerting | `PROD-OPS-007` | SRE / Ops owner | SRE owner |
| Duplicate refund/reversal monitoring | `PROD-OPS-008` | SRE / Finance ops owner | SRE plus Finance ops owner |
| Event handler lag monitoring | `PROD-OPS-009` | SRE / Backend owner | SRE plus backend owner |
| Release-window replay/immutability | `PROD-OPS-010` | Release owner / Ledger owner | Release operator plus ledger owner |
| Operator/app onboarding | `PROD-OPS-012` | Product / Support / Compliance owners | Product, Support, Compliance |
| Final release approval | `PROD-OPS-013` | Release owner | Release owner |

## Activation Prerequisites

### Required Secrets Inventory

Production evidence must include a redacted inventory for:

- `NODE_ENV=production`.
- Backend port and public/private base URLs.
- MySQL host, port, database, app user, password, migration user if separate, and TLS mode if used.
- Redis host, port, password/TLS mode if used, persistence/eviction policy.
- JWT/session secret and rotation owner.
- Customer, worker, and admin frontend API base URLs.
- Operator/admin bootstrap credential path.
- Secret owner, storage location, rotation cadence, and emergency rotation path.

### Domain/TLS/Ingress Requirements

Production evidence must include:

- Approved customer, worker, admin, and API hostnames.
- DNS records pointing to the intended production ingress.
- Valid TLS certificates and renewal owner.
- Reverse proxy or ingress routing for all app surfaces and backend health/API paths.
- CORS and forwarded-header behavior.
- HTTPS smoke evidence through the production ingress path.

### Production DB Requirements

Production evidence must include:

- MySQL topology, version, charset/collation, timezone, and connection limits.
- Database name isolated from staging.
- Least-privilege app user and migration user if separate.
- Backup schedule, retention, restore target, and restore operator.
- Migration target confirmation for Phase 14R, including migration `027_aftersale_refund_reversal.sql`.
- Redacted `schema_migrations` and DB health evidence after migration rehearsal or release-window run.

### Backup/Restore Prerequisite

`PROD-OPS-004` is PASS for staging drill evidence only. Production activation still requires production DB provisioning evidence to identify the production backup schedule, retention, restore target, and restore owner before any production cut.

### Monitoring/Alerting Prerequisite

Production evidence must include dashboards and alert rules for:

- Backend health and DB health.
- Customer, worker, and admin availability.
- HTTP 5xx by route group.
- Authorization/city-scope anomaly rates, with expected guard traffic separated from incidents.
- `event_outbox` pending, published, and error counts.
- Replay and immutability gate results.
- Missing `conflict_audit` traces.

Scaffold reference: `docs/release/PHASE14_PRODUCTION_MONITORING_EVIDENCE.md`.
Optional operator helper: `deploy/production/check-prod-monitoring.ps1 -EnvFile .env.production -DryRun`.

### Refund/Reversal Monitoring Prerequisite

Production evidence must include duplicate and amount-direction monitoring for:

- More than one `refund.approved` event per refund request.
- Duplicate reversal ledger rows grouped by `city_code`, `source_type`, `source_id`, `account_type`, and `direction`.
- Reversal directions: customer `credit`, platform `debit`, worker `debit`.
- Missing conflict audit rows for reversal ledger entries.

The scaffold query set is in `docs/release/PHASE14_PRODUCTION_MONITORING_EVIDENCE.md`. Real production/read-replica output and alert evidence remain required before PASS.

### Event Handler Lag Monitoring Prerequisite

Production evidence must include a pending-age alert for:

```sql
SELECT city_code, COUNT(*) AS pending_count, MIN(created_at) AS oldest_created_at
  FROM event_outbox
 WHERE event_type = 'refund.approved'
   AND status = 'pending'
 GROUP BY city_code;
```

The alert must define age threshold, count threshold, owner, notification route, and remediation runbook.

The production helper can print the exact query set with:

```powershell
deploy\production\check-prod-monitoring.ps1 -EnvFile .env.production -DryRun
```

### Release-Window Replay/Immutability Commands

Required immediately before production cut:

```powershell
.\deploy\production\check-release-window-data.ps1 -EnvFile .env.production -ExpectedCommit <full-40-char-sha> -Confirmation RELEASE-WINDOW-READ-ONLY -QuietWindowConfirmed
```

Required immediately after production cut:

```powershell
.\deploy\production\check-release-window-data.ps1 -EnvFile .env.production -ExpectedCommit <full-40-char-sha> -Confirmation RELEASE-WINDOW-READ-ONLY -QuietWindowConfirmed
```

PASS evidence must show both `check-ledger-replay: passed` and `check-ledger-immutability: passed` in both logs. If an operator provides a production smoke command, attach that output as supporting evidence; the repository production smoke scaffold is `deploy/production/smoke-prod.ps1`.

### Onboarding Signoff Requirement

Product, Support, and Compliance owners must sign off on:

- Customer app onboarding copy and support path.
- Worker onboarding and certification support path.
- Admin operator provisioning.
- Payment/refund support playbook.
- Refund reversal dispute escalation.
- Privacy, terms, and compliance readiness.

### Release Owner Approval Requirement

The release owner may approve production only after every `PROD-OPS-001` through `PROD-OPS-013` row is PASS, release-window validation is attached, deployment/rollback commands are approved, and the production tag/deploy timing is explicitly authorized.

## Remaining PROD-OPS Closure Checklist

| ID | Current status | Evidence provider | Evidence file/command required | Exact PASS criteria | Exact FAIL criteria | Verification scope |
| --- | --- | --- | --- | --- | --- | --- |
| PROD-OPS-001 | NOT RUN | Security / Ops owner | `docs/release/evidence/PHASE14_PROD_SECRETS_INVENTORY_<timestamp>.md` with redacted secret manager/deployment inventory. | All production variables are present, non-empty, non-example, scoped to production, redacted in repo evidence, and have owner/rotation path. | Missing variable, staging/example/default value, plaintext secret committed, no owner, or no rotation path. | Operator-only; Codex can review redacted evidence after it exists. |
| PROD-OPS-002 | NOT RUN | Infra / Ops owner | `docs/release/evidence/PHASE14_PROD_DOMAIN_TLS_INGRESS_<timestamp>.md` plus HTTPS smoke logs. | Approved hostnames, valid TLS, correct ingress routes, CORS/API bases verified, and production ingress smoke passes. | Missing hostname, invalid TLS, HTTP-only route, wrong target, CORS/header failure, or smoke failure. | Operator-only; Codex must not deploy or mutate ingress. |
| PROD-OPS-003 | NOT RUN | DBA / Ops owner | `docs/release/evidence/PHASE14_PROD_DB_PROVISIONING_<timestamp>.md` with redacted DB inventory and SQL outputs. | Isolated production DB exists, secrets are production-only, grants are least-privilege, backup/restore strategy approved, migration target ready. | DB not provisioned, staging reused, backup missing, over-privileged user, unknown timezone/charset, or migration target missing. | Operator-only; Codex can review redacted artifacts. |
| PROD-OPS-007 | NOT RUN | SRE / Ops owner | `docs/release/evidence/PHASE14_PROD_MONITORING_ALERTING_<timestamp>.md` with dashboard/alert exports and notification test; scaffold: `docs/release/PHASE14_PRODUCTION_MONITORING_EVIDENCE.md`. | Dashboards and alerts cover availability, 5xx, outbox, refund, reversal, replay, immutability, and audit gaps; notification route tested. | Manual logs only, missing owner, missing financial/audit signal, untested notification, or staging-only dashboard. | Operator-only; Codex can inspect exported configs. |
| PROD-OPS-008 | NOT RUN | SRE / Finance ops owner | `docs/release/evidence/PHASE14_PROD_DUPLICATE_MONITORING_<timestamp>.md` with SQL/dashboard/alert evidence; optional helper: `deploy/production/check-prod-monitoring.ps1`. | Duplicate refund and reversal queries run against production/read replica, baseline recorded, alerts configured, Finance/SRE approve escalation. | No duplicate query, UAT-only check, no alert, no owner, or duplicates found without accepted remediation. | Operator-only for production data; Codex can review query text and redacted outputs. |
| PROD-OPS-009 | NOT RUN | SRE / Backend owner | `docs/release/evidence/PHASE14_PROD_EVENT_LAG_MONITORING_<timestamp>.md` with pending-age query, alert, notification test, and runbook; optional helper: `deploy/production/check-prod-monitoring.ps1`. | Pending `refund.approved` age is observable, alert threshold approved, owner and remediation path recorded. | No pending-age query, no alert, generic-only outbox alert, missing owner, or untested channel. | Operator-only for live alerting; Codex can review artifacts. |
| PROD-OPS-010 | NOT RUN | Release owner / Ledger owner | Dedicated read-only release-window logs immediately before and after production cut, attached at `docs/release/evidence/PHASE14_PROD_RELEASE_GATE_<timestamp>.md`. | Both `check-release-window-data.ps1` runs pass on the intended production release candidate and include replay and immutability PASS output. | Missing run, wrong timing, wrong commit/environment, failed run, or missing replay/immutability output. | Partially local; final PASS requires release-window operator evidence. |
| PROD-OPS-012 | NOT RUN | Product / Support / Compliance owners | `docs/release/evidence/PHASE14_PROD_OPERATOR_ONBOARDING_SIGNOFF_<timestamp>.md`. | All named owners approve onboarding, support, dispute, privacy, terms, and compliance readiness, or release owner explicitly accepts documented residual gaps. | Missing owner approval, missing support escalation, unresolved compliance/privacy blocker, or onboarding not reviewed. | Human approval only. |
| PROD-OPS-013 | FAIL | Release owner | `docs/release/evidence/PHASE14_PROD_RELEASE_APPROVAL_<timestamp>.md`. | Every `PROD-OPS-*` row is PASS, final validation is green, deployment/rollback plan is approved, and release owner explicitly authorizes production deploy/tag. | Any `PROD-OPS-*` row remains FAIL/NOT RUN, validation fails, deploy/rollback plan missing, or release owner declines/defers. | Human release-owner approval only. |

## Local Verification Boundary

Codex can verify local repository status, docs, typecheck, tests, preflight, and staging smoke. Codex cannot verify production secrets, DNS/TLS, production DB provisioning, production dashboards, production alert routing, production data queries, onboarding approval, or final release approval unless operators provide concrete evidence artifacts.

## Activation Decision Rule

| Condition | Decision |
| --- | --- |
| Any remaining `PROD-OPS-*` item is `FAIL` or `NOT RUN` | NO-GO |
| RC2 staging PASS but production environment evidence is missing | NO-GO |
| Production compose/scripts/env scaffold exists but real production evidence is missing | NO-GO |
| All `PROD-OPS-001` through `PROD-OPS-013` are PASS with evidence and release owner approval | GO |
