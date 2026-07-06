# Phase 14 Tencent Cloud Staging Predeploy Evidence

## Decision

- Evidence status: PASS for cloud-staging predeploy
- Production release status: NO-GO / BLOCKED
- Date: 2026-07-06
- Scope: Tencent Cloud cloud-staging only; no production deploy, no production tag, no production secrets, and no `PROD-OPS-*` production PASS status change.

This evidence records the cloud-staging predeploy result for commit `ec5aef1`. It proves the staging compose stack can build and run on the Tencent Cloud predeploy host with MySQL and Redis bound to localhost-only host ports. It does not approve production launch.

## Target

| Field | Value |
| --- | --- |
| Commit | `ec5aef1` |
| Server host | `123.207.198.136` |
| Server user | `ubuntu` |
| Release path | `/opt/xlb100/releases/ec5aef1` |
| Current symlink | `/opt/xlb100/current -> /opt/xlb100/releases/ec5aef1` |
| Compose file | `deploy/compose/docker-compose.staging.yml` |
| Env file | `.env.staging.example` |

## Commands Run

Local validation before upload:

```powershell
git diff --check
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml config
npx pnpm typecheck
npx pnpm test -- --bail=1 --reporter=verbose
npx pnpm preflight
scripts\smoke-staging.ps1
```

Cloud staging validation:

```bash
cd /opt/xlb100/current
docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml config
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/api/system/db-health
curl -fsS http://localhost:4173/
curl -fsS http://localhost:4174/
curl -fsS http://localhost:4175/
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml logs --tail=200
```

## Compose Config Result

- Result: PASS
- MySQL host binding: `127.0.0.1:3307->3306`
- Redis host binding: `127.0.0.1:6380->6379`
- Public MySQL exposure: NOT OBSERVED
- Public Redis exposure: NOT OBSERVED

Container status after startup:

| Service | Result |
| --- | --- |
| `xlb-backend-staging` | Up |
| `xlb-customer-staging` | Up |
| `xlb-worker-staging` | Up |
| `xlb-admin-staging` | Up |
| `xlb-mysql-staging` | Up / healthy |
| `xlb-redis-staging` | Up / healthy |

## Smoke Result

| Endpoint | Result |
| --- | --- |
| `http://localhost:3000/health` | PASS |
| `http://localhost:3000/api/system/db-health` | PASS |
| `http://localhost:4173/` | PASS |
| `http://localhost:4174/` | PASS |
| `http://localhost:4175/` | PASS |

Backend smoke output confirmed:

```json
{"status":"ok","service":"xlb-backend","phase":"8C","brand":"喜乐帮 / XLB"}
{"ok":true,"mysql":"ok","redis":"ok","database":"xlb_staging","phase":"8C"}
```

## Host Resource Status

`free -h` after startup:

```text
Mem: 3.3Gi total, 987Mi used, 123Mi free, 2.2Gi buff/cache, 2.1Gi available
Swap: 2.0Gi total, 2.0Mi used, 2.0Gi free
```

`df -h` after startup:

```text
/dev/vda2: 40G total, 9.4G used, 29G available, 25% used
```

## Log Risk

- Log risk: LOW
- Backend accepted `/health` and `/api/system/db-health` smoke requests with HTTP 200.
- Customer, worker, and admin preview services returned HTTP 200 for `/`.
- MySQL completed first-start initialization and became ready for connections.
- Redis started and accepted TCP connections.

Observed P3 infra tuning items:

| Item | Severity | Notes |
| --- | --- | --- |
| Redis `vm.overcommit_memory` warning | P3 | Host should set `vm.overcommit_memory=1` before longer-running staging or production-like load tests. |
| Docker requires `sudo` for `ubuntu` | P3 | The `ubuntu` user does not have direct Docker socket permission; cloud-staging was started with `sudo docker compose`. |

## Production Boundary

- Production deploy was not run.
- `deploy-prod.ps1` was not run.
- `.env.production` was not created.
- No production secrets were used.
- No production tag was created.
- Production remains NO-GO / BLOCKED.

## Result

Tencent Cloud cloud-staging predeploy for commit `ec5aef1` is PASS. The production readiness state is unchanged and still requires real production environment evidence plus human release-owner approval before any production GO decision.
