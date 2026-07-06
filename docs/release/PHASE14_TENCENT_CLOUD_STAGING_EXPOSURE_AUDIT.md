# Phase 14 Tencent Cloud Staging Exposure Audit

## Decision

- Audit status: COMPLETE
- Tencent Cloud cloud-staging status: PASS
- Production release status: NO-GO / BLOCKED
- Date: 2026-07-06
- Scope: exposure and infra tuning audit only; no production deploy, no production env, no production tag, no schema change, and no business or ledger/replay/audit logic change.

This audit records the network exposure and host tuning state for the Tencent Cloud cloud-staging stack. It does not approve production release.

## Current Release State

| Field | Value |
| --- | --- |
| Cloud host | `123.207.198.136` |
| Running release | `3f650ae` |
| Running release path | `/opt/xlb100/releases/3f650ae` |
| Current symlink | `/opt/xlb100/current -> /opt/xlb100/releases/3f650ae` |
| GitHub `main` at reverse-proxy deploy | `3f650ae` |
| Difference from prior running release | `3f650ae` adds the cloud-staging Nginx reverse proxy on public HTTP port `80`; raw app/data ports remain localhost-only. |
| Compose file | `deploy/compose/docker-compose.staging.yml` |
| Env file | `.env.staging.example` |
| Reverse proxy config | `infra/nginx/cloud-staging.conf` |

## Commands Run

```bash
cd /opt/xlb100/current
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
sudo ss -tulpn
sudo docker ps --format "table {{.Names}}\t{{.Ports}}"
sysctl vm.overcommit_memory
free -h
df -h
sudo docker system df
```

Post-security-group internal smoke verification:

```bash
cd /opt/xlb100/current
curl -fsS http://localhost:3000/health
curl -fsS http://localhost:3000/api/system/db-health
curl -fsS http://localhost:4173/
curl -fsS http://localhost:4174/
curl -fsS http://localhost:4175/
sudo ss -tulpn
sudo docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Compose-level localhost hardening verification:

```bash
cd /opt/xlb100/current
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml config
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
sudo ss -tulpn
sudo docker ps --format "table {{.Names}}\t{{.Ports}}"
```

Reverse-proxy verification:

```bash
cd /opt/xlb100/current
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml config
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml up -d --build
sudo docker compose --env-file .env.staging.example -f deploy/compose/docker-compose.staging.yml ps
curl -fsS http://localhost/health
curl -fsS http://localhost/api/system/db-health
curl -fsS http://localhost/customer/
curl -fsS http://localhost/worker/
curl -fsS http://localhost/admin/
sudo ss -tulpn
sudo docker ps --format "table {{.Names}}\t{{.Ports}}"
```

## Container Port Exposure

| Container | Published ports | Exposure result |
| --- | --- | --- |
| `xlb-staging-proxy` | `0.0.0.0:80->80/tcp`, `:::80->80/tcp` | Public cloud-staging HTTP entry. Routes only through Nginx to backend and frontend containers on the Docker network. |
| `xlb-backend-staging` | `127.0.0.1:3000->3000/tcp` | Backend raw port is host-bound to localhost only; not publicly exposed by Docker publish. |
| `xlb-customer-staging` | `127.0.0.1:4173->4173/tcp` | Customer raw frontend port is host-bound to localhost only; not publicly exposed by Docker publish. |
| `xlb-worker-staging` | `127.0.0.1:4174->4173/tcp` | Worker raw frontend host port is localhost-only; container serves internally on `4173`. |
| `xlb-admin-staging` | `127.0.0.1:4175->4173/tcp` | Admin raw frontend host port is localhost-only; container serves internally on `4173`. |
| `xlb-mysql-staging` | `33060/tcp`, `127.0.0.1:3307->3306/tcp` | MySQL SQL port is host-bound to localhost only; not publicly exposed by Docker publish. |
| `xlb-redis-staging` | `127.0.0.1:6380->6379/tcp` | Redis is host-bound to localhost only; not publicly exposed by Docker publish. |

Host socket audit confirmed the same bindings:

| Port | Listener | Risk |
| --- | --- | --- |
| `22` | `0.0.0.0`, `::` | SSH is public if Tencent security group permits; expected management exposure. |
| `80` | `0.0.0.0`, `::` | Nginx cloud-staging HTTP entry; acceptable only for controlled external staging testing. |
| `3000` | `127.0.0.1` | Backend staging API is localhost-only at the VM listener layer. |
| `4173` | `127.0.0.1` | Customer staging frontend is localhost-only at the VM listener layer. |
| `4174` | `127.0.0.1` | Worker staging frontend is localhost-only at the VM listener layer. |
| `4175` | `127.0.0.1` | Admin staging frontend is localhost-only at the VM listener layer. |
| `3307` | `127.0.0.1` | MySQL host publish is localhost-only. |
| `6380` | `127.0.0.1` | Redis host publish is localhost-only. |

## Exposure Findings

### MySQL And Redis

- MySQL exposure status: PASS for staging safety.
- Redis exposure status: PASS for staging safety.
- Evidence: Docker and `ss` both show MySQL and Redis bound to `127.0.0.1` only.
- Public MySQL/Redis exposure: NOT OBSERVED.

### Staging App Ports

- App port exposure status: PASS for cloud-staging localhost-only hardening.
- Backend and frontend staging ports are published to localhost only:
  - Backend: `3000`
  - Customer frontend: `4173`
  - Worker frontend: `4174`
  - Admin frontend: `4175`
- These ports are no longer publicly reachable through Docker host publishing.
- External browser/API access is available only through the cloud-staging Nginx reverse proxy on HTTP port `80`.

### Cloud-Staging Reverse Proxy

- Reverse proxy status: PASS for cloud-staging external HTTP entry.
- Public entry: `http://123.207.198.136/` on port `80`, subject to Tencent Cloud security group policy.
- Route map:
  - `/health` -> `backend:3000/health`
  - `/api/` -> `backend:3000/api/`
  - `/customer/` -> `customer:4173/`
  - `/worker/` -> `worker:4173/`
  - `/admin/` -> `admin:4173/`
- TLS/domain status: FUTURE WORK. No domain or TLS certificate is configured for this cloud-staging predeploy.
- Production relevance: validates an ingress shape for future production readiness, but does not approve production release.

### Tencent Cloud Security Group Hardening

- Security group hardening status: OPERATOR-UPDATED / INTERNALLY VERIFIED.
- Required Tencent Cloud inbound allowlist for this cloud-staging host:
  - Allow `22` for SSH administration from approved operator sources.
  - Allow `80` and `443` only when an approved HTTP/TLS ingress is configured.
  - Do not publicly allow raw app ports `3000`, `4173`, `4174`, or `4175`.
  - Do not publicly allow MySQL `3307` or Redis `6380`.
- VM-level verification cannot directly inspect Tencent Cloud security group policy; this audit records the required operator-managed state and verifies that internal localhost smoke still passes after the reported security group update.
- Raw app host ports no longer listen on `0.0.0.0`/`::`; Docker publishes backend, customer, worker, and admin host ports on `127.0.0.1` only.
- External staging access now goes through the approved cloud-staging Nginx HTTP entry on port `80`. Raw app/data ports remain non-public.

Post-hardening internal smoke result: PASS.

| Endpoint | Result |
| --- | --- |
| `http://localhost:3000/health` | PASS |
| `http://localhost:3000/api/system/db-health` | PASS |
| `http://localhost:4173/` | PASS |
| `http://localhost:4174/` | PASS |
| `http://localhost:4175/` | PASS |

Reverse-proxy smoke result: PASS.

| Endpoint | Result |
| --- | --- |
| `http://localhost/health` | PASS |
| `http://localhost/api/system/db-health` | PASS |
| `http://localhost/customer/` | PASS |
| `http://localhost/worker/` | PASS |
| `http://localhost/admin/` | PASS |

Backend internal smoke output:

```json
{"status":"ok","service":"xlb-backend","phase":"8C","brand":"喜乐帮 / XLB"}
{"ok":true,"mysql":"ok","redis":"ok","database":"xlb_staging","phase":"8C"}
```

Localhost-only port binding result:

```text
xlb-staging-proxy      0.0.0.0:80->80/tcp, :::80->80/tcp
xlb-backend-staging    127.0.0.1:3000->3000/tcp
xlb-customer-staging   127.0.0.1:4173->4173/tcp
xlb-worker-staging     127.0.0.1:4174->4173/tcp
xlb-admin-staging      127.0.0.1:4175->4173/tcp
xlb-mysql-staging      33060/tcp, 127.0.0.1:3307->3306/tcp
xlb-redis-staging      127.0.0.1:6380->6379/tcp
```

## Infra Tuning

### Redis Memory Overcommit

`sysctl vm.overcommit_memory` returned:

```text
vm.overcommit_memory = 0
```

Risk:

- Redis logs warn that memory overcommit should be enabled.
- Severity: P3 infra tuning for cloud-staging.
- Recommendation: before longer-running staging or production-like load tests, set `vm.overcommit_memory=1` via approved host configuration.

### Docker Sudo Requirement

Cloud-staging Docker commands require `sudo docker ...` for the `ubuntu` user.

Risk:

- Severity: P3 infra tuning.
- Operational scripts or runbooks must either use `sudo` explicitly or the operator account must be placed in an approved Docker access path.

## Resource Status

`free -h`:

```text
Mem: 3.3Gi total, 995Mi used, 133Mi free, 2.2Gi buff/cache, 2.1Gi available
Swap: 2.0Gi total, 2.0Mi used, 2.0Gi free
```

`df -h`:

```text
/dev/vda2: 40G total, 9.4G used, 29G available, 26% used
```

`sudo docker system df`:

```text
Images: 6 total, 6 active, 1.747GB, 147.9MB reclaimable
Containers: 6 total, 6 active, 144B
Local Volumes: 2 total, 2 active, 218.3MB
Build Cache: 45 entries, 740.1MB reclaimable
```

Resource result:

- Memory: acceptable for current cloud-staging idle smoke state.
- Disk: acceptable; root filesystem has 29G available.
- Docker usage: acceptable; build cache can be pruned later if disk pressure appears.

## Recommendation

- Keep production status NO-GO / BLOCKED.
- Keep MySQL, Redis, backend, customer, worker, and admin raw staging ports localhost-bound for all staging and production-like predeploy runs.
- Keep Tencent Cloud security group closed for raw app ports `3000`, `4173`, `4174`, and `4175`; they are now localhost-only and should stay non-public.
- Tencent Cloud security group may allow `80` for this cloud-staging HTTP reverse proxy and `22` for approved operator SSH access. Keep `443` closed until TLS is configured.
- Before production readiness, replace the HTTP-only staging entry with domain-backed TLS on `443` through Nginx/Caddy or an approved managed ingress.
- Treat Redis `vm.overcommit_memory=0` and the `sudo docker` requirement as P3 infra tuning items, not blockers for the current cloud-staging smoke PASS.

## Production Boundary

- Production deploy was not run.
- `.env.production` was not created.
- No production secrets were used.
- No production tag was created.
- No `PROD-OPS-*` production blocker was marked PASS.
- Production remains NO-GO / BLOCKED.
