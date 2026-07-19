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
| `deploy/compose/docker-compose.prod.yml` | Production-intended app service compose scaffold for Nginx gateway, backend/jobs, customer, worker, and admin. It expects external production MySQL, Redis, secret material, DNS/WAF, monitoring, and backups. |
| `deploy/production/deploy-prod.ps1` | Guarded production deploy wrapper. It refuses example env files and requires explicit confirmation before any run. Without `-Apply`, it performs a dry run. |
| `deploy/production/smoke-prod.ps1` | Production edge and non-durable business smoke. It verifies three same-origin API routes, CSP/security headers, production debug-route closure, Customer catalog/quote/existing order, and WebSocket ready/ping/pong without durable business writes. |
| `deploy/production/rollback-prod.ps1` | Guarded production rollback wrapper. It requires explicit confirmation, an immutable previous image digest, and points operators to the rollback runbook. |

## Safety Controls

- No real secrets are included.
- `.env.production.example` uses placeholder values only.
- `docker-compose.prod.yml` does not define MySQL or Redis containers; production DB/Redis must be provisioned externally and evidenced separately.
- `docker-compose.prod.yml` renders the Nginx template from `XLB_DOMAIN`, mounts TLS from read-only secret files, binds explicit HTTP/HTTPS addresses, and requires an immutable gateway image digest.
- Browser apps use same-origin `/api` and same-origin WebSocket; no broad production CORS policy is introduced.
- Public gateway `/metrics` is denied. Prometheus must scrape `backend:3000/metrics` from the private network.
- `deploy-prod.ps1` refuses to use `*.example` env files.
- `deploy-prod.ps1` requires `-Confirmation DEPLOY-PHASE14-PRODUCTION`.
- `deploy-prod.ps1` defaults to dry-run behavior unless `-Apply` is provided.
- `smoke-prod.ps1` requires HTTPS URLs, rejects `.invalid` placeholders and localhost unless explicitly allowed, refuses redirects, and reads the short-lived Customer smoke bearer only from a materialized secret file.
- The smoke account needs one enabled SKU and one pre-existing owned order. The smoke does not create orders or execute payment/refund/payout actions; its one-time WebSocket ticket is non-durable Redis state.
- `rollback-prod.ps1` refuses to use `*.example` env files.
- `rollback-prod.ps1` requires `-Confirmation ROLLBACK-PHASE14-PRODUCTION`.
- `rollback-prod.ps1` requires `-PreviousImageDigest` evidence.
- `rollback-prod.ps1` defaults to dry-run behavior unless `-Apply` is provided.

## Intended Future Commands

Validate scaffold rendering only:

```powershell
pnpm gate:unit-b-production-edge
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
deploy\production\rollback-prod.ps1 -EnvFile .env.production -PreviousImageDigest <registry/image@sha256:digest> -Confirmation ROLLBACK-PHASE14-PRODUCTION
```

## Non-Goals

- This scaffold does not deploy production.
- This scaffold does not create a production tag.
- This scaffold does not prove production secrets, DNS/TLS, DB provisioning, monitoring, alerting, onboarding, or release approval.
- The Unit B repository Lock does not prove real DNS/certificates, an upstream CLB/WAF, TKE/Helm/Ingress, dual-instance WebSocket behavior, or a real production smoke run.
- The checked-in topology assumes this Nginx terminates TLS and is the backend's single trusted proxy hop. A future L7 CLB/Ingress topology must explicitly configure trusted real-IP CIDRs, re-evaluate rate limiting and `TRUST_PROXY_HOPS`, and must never expose `/metrics` through a public listener.
- This scaffold does not close `PROD-OPS-001`, `PROD-OPS-002`, `PROD-OPS-003`, `PROD-OPS-007`, `PROD-OPS-008`, `PROD-OPS-009`, `PROD-OPS-010`, `PROD-OPS-012`, or `PROD-OPS-013`.

## Production Readiness Impact

The repo now has a minimal production deployment scaffold that can be used by operators to produce future evidence. Production remains NO-GO / BLOCKED until every remaining `PROD-OPS-*` item is PASS with concrete operator evidence and release owner approval.
