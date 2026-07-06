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
| Running release | `ec5aef1` |
| Running release path | `/opt/xlb100/releases/ec5aef1` |
| Current symlink | `/opt/xlb100/current -> /opt/xlb100/releases/ec5aef1` |
| GitHub `main` | `c423d39` |
| Difference from running release | `c423d39` is docs/test evidence added after the running `ec5aef1` deploy. |
| Compose file | `deploy/compose/docker-compose.staging.yml` |
| Env file | `.env.staging.example` |

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

## Container Port Exposure

| Container | Published ports | Exposure result |
| --- | --- | --- |
| `xlb-backend-staging` | `0.0.0.0:3000->3000/tcp`, `:::3000->3000/tcp` | Bound to all IPv4/IPv6 interfaces; publicly reachable if Tencent security group permits port `3000`. |
| `xlb-customer-staging` | `0.0.0.0:4173->4173/tcp`, `:::4173->4173/tcp` | Bound to all IPv4/IPv6 interfaces; publicly reachable if Tencent security group permits port `4173`. |
| `xlb-worker-staging` | `0.0.0.0:4174->4173/tcp`, `:::4174->4173/tcp` | Bound to all IPv4/IPv6 interfaces; publicly reachable if Tencent security group permits port `4174`. |
| `xlb-admin-staging` | `0.0.0.0:4175->4173/tcp`, `:::4175->4173/tcp` | Bound to all IPv4/IPv6 interfaces; publicly reachable if Tencent security group permits port `4175`. |
| `xlb-mysql-staging` | `33060/tcp`, `127.0.0.1:3307->3306/tcp` | MySQL SQL port is host-bound to localhost only; not publicly exposed by Docker publish. |
| `xlb-redis-staging` | `127.0.0.1:6380->6379/tcp` | Redis is host-bound to localhost only; not publicly exposed by Docker publish. |

Host socket audit confirmed the same bindings:

| Port | Listener | Risk |
| --- | --- | --- |
| `22` | `0.0.0.0`, `::` | SSH is public if Tencent security group permits; expected management exposure. |
| `3000` | `0.0.0.0`, `::` | Backend staging API may be public if security group permits. |
| `4173` | `0.0.0.0`, `::` | Customer staging frontend may be public if security group permits. |
| `4174` | `0.0.0.0`, `::` | Worker staging frontend may be public if security group permits. |
| `4175` | `0.0.0.0`, `::` | Admin staging frontend may be public if security group permits. |
| `3307` | `127.0.0.1` | MySQL host publish is localhost-only. |
| `6380` | `127.0.0.1` | Redis host publish is localhost-only. |

## Exposure Findings

### MySQL And Redis

- MySQL exposure status: PASS for staging safety.
- Redis exposure status: PASS for staging safety.
- Evidence: Docker and `ss` both show MySQL and Redis bound to `127.0.0.1` only.
- Public MySQL/Redis exposure: NOT OBSERVED.

### Staging App Ports

- App port exposure status: REVIEW REQUIRED.
- Backend and frontend staging ports are intentionally published on all host interfaces:
  - Backend: `3000`
  - Customer frontend: `4173`
  - Worker frontend: `4174`
  - Admin frontend: `4175`
- These ports are publicly reachable from the internet if the Tencent Cloud security group allows inbound traffic to them.
- This is acceptable only for controlled cloud-staging use with a restrictive security group. It is not a production ingress design.

### Tencent Cloud Security Group Hardening

- Security group hardening status: OPERATOR-UPDATED / INTERNALLY VERIFIED.
- Required Tencent Cloud inbound allowlist for this cloud-staging host:
  - Allow `22` for SSH administration from approved operator sources.
  - Allow `80` and `443` only when an approved HTTP/TLS ingress is configured.
  - Do not publicly allow raw app ports `3000`, `4173`, `4174`, or `4175`.
  - Do not publicly allow MySQL `3307` or Redis `6380`.
- VM-level verification cannot directly inspect Tencent Cloud security group policy; this audit records the required operator-managed state and verifies that internal localhost smoke still passes after the reported security group update.
- Raw app processes still listen on `0.0.0.0`/`::` inside the VM, so external exposure remains controlled by Tencent Cloud security group policy until a reverse proxy binds the public surface.

Post-hardening internal smoke result: PASS.

| Endpoint | Result |
| --- | --- |
| `http://localhost:3000/health` | PASS |
| `http://localhost:3000/api/system/db-health` | PASS |
| `http://localhost:4173/` | PASS |
| `http://localhost:4174/` | PASS |
| `http://localhost:4175/` | PASS |

Backend internal smoke output:

```json
{"status":"ok","service":"xlb-backend","phase":"8C","brand":"喜乐帮 / XLB"}
{"ok":true,"mysql":"ok","redis":"ok","database":"xlb_staging","phase":"8C"}
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
- Keep MySQL and Redis localhost-bound for all staging and production-like predeploy runs.
- Keep Tencent Cloud security group closed for raw app ports `3000`, `4173`, `4174`, and `4175`; use only approved operator access or future ingress.
- Tencent Cloud security group should allow only `22`, `80`, and `443` as approved for the current operating mode; `80/443` should remain closed unless an approved reverse proxy/TLS ingress is active.
- Before production readiness, decide whether to bind app containers to localhost and front them with Nginx/Caddy on `80/443` with TLS, rather than exposing raw app ports.
- Treat Redis `vm.overcommit_memory=0` and the `sudo docker` requirement as P3 infra tuning items, not blockers for the current cloud-staging smoke PASS.

## Production Boundary

- Production deploy was not run.
- `.env.production` was not created.
- No production secrets were used.
- No production tag was created.
- No `PROD-OPS-*` production blocker was marked PASS.
- Production remains NO-GO / BLOCKED.
