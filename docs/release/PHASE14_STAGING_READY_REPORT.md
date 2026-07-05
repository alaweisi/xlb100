# PHASE 14 — Staging Readiness Report

Date: 2026-07-05
Commit checked: `3e4397f`

## READY / NOT READY
- **NOT READY**

## 1) Build / deploy scripts inventory

### Root package scripts
- `build`: `turbo run build`
- `typecheck`: `turbo run typecheck`
- `test`: `vitest run`
- `preflight`: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/preflight-architecture.ps1`

### Package app/service scripts used for staging readiness
- Backend (`backend/package.json`): `dev`, `build`, `start`, `typecheck`
- Admin (`apps/admin/package.json`): `dev`, `build`, `preview`, `typecheck`
- Customer (`apps/customer/package.json`): `dev`, `build`, `preview`, `typecheck`
- Worker (`apps/worker/package.json`): `dev`, `build`, `preview`, `typecheck`
- Note: no deployment orchestration script exists in npm scripts (no `deploy`, `compose`, or `release` script).

## 2) Docker compose / staging infra check

### Compose files found
- `deploy/compose/docker-compose.staging.yml`
- `deploy/compose/docker-compose.prod.yml`
- `deploy/compose/docker-compose.local.yml`

### Status
- `docker-compose.staging.yml` currently contains:
  ```yml
  services: {}
  ```
  (no backend/frontend/mysql/redis services defined).

### Dockerfiles
- `infra/docker/Dockerfile.backend` and `infra/docker/Dockerfile.frontend` contain only skeleton comments and no build/publish stages.

### Blocker
- **Staging deployment cannot be executed from repo infra as-is**.

## 3) Required env vars (discovered)

From `.env.example` and backend config (`packages/config/src/env.ts`):
- `NODE_ENV`
- `BACKEND_PORT`
- `MYSQL_HOST`
- `MYSQL_PORT`
- `MYSQL_DATABASE`
- `MYSQL_USER`
- `MYSQL_PASSWORD`
- `REDIS_HOST`
- `REDIS_PORT`
- `JWT_SECRET`

Notes:
- No frontend app source currently references additional `VITE_*` or backend URL env vars.
- `scripts/migrate-local.ps1` and `scripts/seed-local.ps1` hardcode local container credentials/host (`xlb-mysql-local`, `xlb`, `xlb_local_password`, `xlb_local`) and are not parameterized for staging.

## 4) Backend build readiness

Ran:
```powershell
npx pnpm --filter @xlb/backend build
```
Result: **PASS**.

Backend also exposes:
- `/health`
- `/api/system/status`
- `/api/system/db-health`

## 5) Customer/Worker/Admin build readiness

Ran:
```powershell
npx pnpm --filter @xlb/admin build
npx pnpm --filter @xlb/customer build
npx pnpm --filter @xlb/worker build
```
All three app builds returned **PASS**.

## 6) Database migration readiness

Migration / seed scripts exist:
- `scripts/migrate-local.ps1`
- `scripts/seed-local.ps1`

Observed behavior:
- apply to local docker container `xlb-mysql-local`
- reads SQL files from `db/migrations` and `db/seed`
- migration state tracked in `schema_migrations`

Status: **local-only readiness; no staging-aware migration bootstrap in repository orchestration**.

## 7) Smoke test scripts

Available:
- `scripts/smoke-test.ps1`
- `scripts/db-health.ps1`

Observed today:
- `smoke-test.ps1` exits with “backend not running” (because backend not started in this environment).
- `db-health.ps1` exits “backend not reachable” until backend is running and `http://localhost:3000/api/system/db-health` responds.

## 8) Exact commands for deployment (as currently defined)

### Staging deployment attempt commands
```powershell
# (1) Build code artifacts
npx pnpm --filter @xlb/backend build
npx pnpm --filter @xlb/admin build
npx pnpm --filter @xlb/customer build
npx pnpm --filter @xlb/worker build

# (2) Start infra (local baseline only)
docker compose -f deploy/compose/docker-compose.local.yml up -d

# (3) Apply schema + seed (local script only)
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/seed-local.ps1

# (4) Start backend
npx pnpm --filter @xlb/backend dev
```

### Staging smoke test commands
```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/smoke-test.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/db-health.ps1

# Direct endpoint checks
curl http://localhost:3000/health
curl http://localhost:3000/api/system/status
curl http://localhost:3000/api/system/db-health
```

## 9) Exact blockers (current)
1. **Blocking:** `deploy/compose/docker-compose.staging.yml` is a placeholder (`services: {}`), so staging service graph is missing.
2. **Blocking:** `infra/docker/Dockerfile.backend` and `infra/docker/Dockerfile.frontend` are placeholders and cannot produce deployable images.
3. **Blocking:** `npx pnpm preflight` fails at `check-phase9b-forbidden-zone` (currently flagged file `docs/release/PHASE14_READINESS_REPORT.md` with forbidden-token diff line).
4. **Blocking:** No staging deployment runner in package scripts (no `deploy`/orchestrator command).

## 10) Commit deployability
- Current commit `3e4397f`: **NOT deployable to staging in current state** because of the blockers above.
