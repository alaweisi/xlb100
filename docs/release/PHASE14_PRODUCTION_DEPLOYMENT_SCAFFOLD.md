# Phase 14 Production Deployment Scaffold

## Decision

- Scaffold status: REPO-READY FOR FUTURE VERIFICATION
- Production release status: NO-GO / BLOCKED
- Scaffold date: 2026-07-06
- Scope: deployment scaffold only; no production deployment, production tag, business logic, ledger/replay/audit logic, DB schema, or CI gate change.

This scaffold creates a safe repo baseline for later production verification. It does not make production GO and does not mark any `PROD-OPS-*` item PASS.

## Files Added Or Updated

| File | Purpose |
| --- | --- |
| `.env.production.example` | Placeholder-only production env template. It must not be used as production evidence or committed with real secrets. |
| `deploy/compose/docker-compose.prod.yml` | Production-intended app service compose scaffold for backend, customer, worker, and admin. It expects external production MySQL, Redis, ingress, TLS, secrets, monitoring, and backups. |
| `deploy/production/deploy-prod.ps1` | Guarded production deploy wrapper. It refuses example env files and requires explicit confirmation before any run. Without `-Apply`, it performs a dry run. |
| `deploy/production/smoke-prod.ps1` | Production smoke scaffold. It reads HTTPS production URLs from env/config and does not hardcode localhost. |
| `deploy/production/rollback-prod.ps1` | Guarded production rollback wrapper. It requires explicit confirmation, a previous image/git tag reference, and points operators to the rollback runbook. |

## Safety Controls

- No real secrets are included.
- `.env.production.example` uses placeholder values only.
- `docker-compose.prod.yml` does not define MySQL or Redis containers; production DB/Redis must be provisioned externally and evidenced separately.
- `deploy-prod.ps1` refuses to use `*.example` env files.
- `deploy-prod.ps1` requires `-Confirmation DEPLOY-PHASE14-PRODUCTION`.
- `deploy-prod.ps1` defaults to dry-run behavior unless `-Apply` is provided.
- `smoke-prod.ps1` requires HTTPS URLs from env/config and rejects localhost unless `-AllowLocalhost` is explicitly passed for non-production diagnostics.
- `rollback-prod.ps1` refuses to use `*.example` env files.
- `rollback-prod.ps1` requires `-Confirmation ROLLBACK-PHASE14-PRODUCTION`.
- `rollback-prod.ps1` requires `-PreviousImageTag` evidence.
- `rollback-prod.ps1` defaults to dry-run behavior unless `-Apply` is provided.

## Intended Future Commands

Validate scaffold rendering only:

```powershell
docker compose --env-file .env.production.example -f deploy/compose/docker-compose.prod.yml config
```

Dry-run a future production deploy after operators create a real `.env.production`:

```powershell
deploy\production\deploy-prod.ps1 -EnvFile .env.production -Confirmation DEPLOY-PHASE14-PRODUCTION
```

Run production smoke after real production URLs are configured:

```powershell
deploy\production\smoke-prod.ps1 -EnvFile .env.production
```

Dry-run a rollback after release owner approval:

```powershell
deploy\production\rollback-prod.ps1 -EnvFile .env.production -PreviousImageTag <previous-approved-tag-or-image> -Confirmation ROLLBACK-PHASE14-PRODUCTION
```

## Non-Goals

- This scaffold does not deploy production.
- This scaffold does not create a production tag.
- This scaffold does not prove production secrets, DNS/TLS, DB provisioning, monitoring, alerting, onboarding, or release approval.
- This scaffold does not close `PROD-OPS-001`, `PROD-OPS-002`, `PROD-OPS-003`, `PROD-OPS-007`, `PROD-OPS-008`, `PROD-OPS-009`, `PROD-OPS-010`, `PROD-OPS-012`, or `PROD-OPS-013`.

## Production Readiness Impact

The repo now has a minimal production deployment scaffold that can be used by operators to produce future evidence. Production remains NO-GO / BLOCKED until every remaining `PROD-OPS-*` item is PASS with concrete operator evidence and release owner approval.
