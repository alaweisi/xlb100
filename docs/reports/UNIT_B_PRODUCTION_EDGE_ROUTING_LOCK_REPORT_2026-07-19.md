# XLB Commercialization Unit B Production Edge Routing Lock Report

Date: 2026-07-19

Decision: **LOCKED — REPOSITORY ONLY**

Production release: **NO-GO / BLOCKED**

Lock commit: the local commit containing this report

Tag: none

## 1. Authorized scope

The Human authorized construction, Agent-cluster review, self-acceptance and a local Lock commit for Unit B:

- production Nginx gateway;
- Customer/Worker/Admin same-origin `/api/` routing;
- exact `/api/support/realtime` WebSocket routing;
- a production business Smoke skeleton;
- related repository checks, tests and Lock evidence.

The authorization did not include push, real deployment, production data, real Provider execution or public release. No security contract, persistent schema, money-domain rule or business state machine was changed.

## 2. Delivered engineering controls

### 2.1 Canonical same-origin edge

- `customer.<domain>`, `worker.<domain>` and `admin.<domain>` route `/api/` to `backend:3000` before the frontend fallback.
- All three applications retain the existing same-origin API base. No broad CORS allowlist and no cross-origin production API base were introduced.
- `api.<domain>` remains available for direct backend health and operator/API access.
- Unknown HTTP/HTTPS Host values are rejected by default servers.

### 2.2 WebSocket transport path

- `api`, `customer`, `worker` and `admin` domains have an exact `/api/support/realtime` location.
- Each location forwards HTTP/1.1 Upgrade/Connection, the trusted proxy headers, 90-second read timeout and disabled proxy buffering.
- The production Smoke obtains a one-time authenticated realtime ticket and verifies `ready -> ping -> pong` over same-origin WSS.
- The ticket is ephemeral Redis state. The Smoke makes no durable business mutation.

### 2.3 Browser and ingress security

- Frontend domains emit HSTS, CSP, `nosniff`, Referrer-Policy and Permissions-Policy.
- CSP keeps `style-src 'unsafe-inline'` only because the current React UI still contains inline style usage; scripts remain `self` only.
- `client_max_body_size 10m` is applied to every app edge so existing fulfillment evidence uploads are not blocked by Nginx's default 1 MiB limit.
- Public `/metrics` is denied without proxying. Prometheus must scrape `backend:3000/metrics` on the private network.

### 2.4 Deployable Compose gateway

- Production Compose now includes the gateway instead of leaving the Nginx template as an orphan asset.
- Gateway, backend and all frontend images require immutable registry digests.
- Domain rendering is restricted to `XLB_DOMAIN` through the official Nginx template entrypoint.
- TLS certificate/private key are read-only Compose Secrets.
- Gateway runs as UID/GID 101, read-only, with all capabilities dropped except `NET_BIND_SERVICE`, no-new-privileges and explicitly writable tmpfs paths.
- HTTP and HTTPS bind addresses are explicit production settings.

### 2.5 Production Smoke semantics

The default Smoke is intentionally strict and fails when any required setting is absent. It verifies:

1. direct backend health and DB/Redis/data-reliability/jobs health;
2. Customer, Worker and Admin same-origin `/api/system/status` return backend JSON rather than frontend HTML;
3. three frontend HTML documents and required security headers;
4. the production Customer `debug-code` route returns 404;
5. a dedicated Customer smoke account can read its city catalog;
6. the configured enabled SKU returns a matching CNY quote and breakdown;
7. the dedicated account can read one pre-existing owned order in the configured city;
8. one-time realtime ticket issuance and same-origin WebSocket `ready/ping/pong`.

The script refuses redirects, non-HTTPS URLs, `.invalid` placeholders and localhost unless explicitly enabled for diagnostics. The bearer is loaded from a materialized secret file and is never printed.

## 3. Agent-cluster review

Three read-only review agents independently checked:

- Nginx/API base/CSP/security headers;
- production Smoke coverage and failure semantics;
- WebSocket, Compose integration and Lock truth boundaries.

Their findings drove the following corrections before Lock:

- attached the previously orphaned Nginx template to Production Compose;
- aligned `${XLB_DOMAIN}` rendering and TLS Secret paths;
- made Nginx tmpfs writable by non-root UID 101;
- denied public metrics instead of trusting RFC1918 load-balancer addresses;
- rejected unknown Host values;
- pinned the local `nginx -t` verification image to digest `sha256:65645c7bb6a0661892a8b03b89d0743208a18dd2f3f17a54ef4b76fb8e2f2a10`;
- strengthened Smoke assertions and documented its ephemeral Redis ticket truth.

Final independent conclusion after these corrections: implementation P0=0. The remaining items require a real environment and are listed below.

## 4. Verification evidence

| Verification | Result |
|---|---|
| `pnpm gate:unit-b-production-edge` | PASS |
| Unit B contract tests | PASS, 5/5 |
| Static Nginx/Compose/Smoke boundary checker | PASS |
| Nginx template rendering as UID 101 on read-only filesystem | PASS |
| Containerized `nginx -t` with pinned image digest | PASS |
| Smoke valid fixture dry-run and token non-disclosure | PASS |
| Smoke `.invalid` negative fixture | PASS |
| Production Compose expansion/repository readiness | PASS |
| `pnpm typecheck` | PASS, 17/17 tasks |
| `pnpm build` | PASS, 11/11 tasks |
| `pnpm test:ci-supply` | PASS, 8/8 |
| `pnpm lint` | PASS, 0 errors; one pre-existing backend unused-variable warning |
| `git diff --check` | PASS |

The mandatory one-time full regression was also run. It did not become green:

- DB/security tranche: 197/200 test files passed, 616/622 tests passed, one skipped.
- Five failures were outside Unit B:
  - two Phase25 tests detected the current uncommitted Customer UI hardcode counts `157 > 43`, `37 > 1`, and `1 > 0`;
  - three Phase27/28 tests still require old exact Phase14 strings (`Phase 14 | IN PROGRESS` and the old `64/100` sentence).
- No Unit B implementation or test failed.

This scoped Lock does not hide or waive the global red Gate. W0 must still restore the whole repository to green.

## 5. Lock boundaries and remaining production blockers

This Lock proves that the repository contains an executable production edge configuration and a fail-closed Smoke skeleton. It does **not** prove that a real environment exists.

Still required before Staging/Production GO:

1. real DNS, valid certificate, WAF/CLB decision and external reachability;
2. real staging execution of three-domain same-origin JSON routing and WSS;
3. browser verification that the final CSP supports same-origin WSS on supported browsers;
4. dual-backend WebSocket fanout, reconnect and rolling-restart evidence;
5. managed MySQL/Redis, real Secret Manager material, monitoring, alerting and backups;
6. TKE/Helm/Ingress application delivery, which is outside Unit B;
7. real production Smoke account/token/SKU/order provisioned during a release window;
8. real SMS/COS/payment and all other commercial blockers from the engineering audit.

The current Compose topology assumes Nginx is the TLS terminator and the backend has one trusted proxy hop. If a future L7 CLB or TKE Ingress terminates/proxies HTTP before Nginx, the release must explicitly configure trusted `set_real_ip_from` CIDRs, `real_ip_header`, `real_ip_recursive`, rate-limit identity and backend `TRUST_PROXY_HOPS`. Public metrics must remain unavailable.

`Permissions-Policy: geolocation=()` is correct for the current applications but must be reviewed when browser-based map/location support is introduced.

## 6. Final decision

`UNIT_B_PRODUCTION_EDGE_REPOSITORY = LOCKED`

`REAL_STAGING_EDGE = NOT VERIFIED`

`PRODUCTION_RELEASE = NO_GO`

`PRODUCTION_ACTIVATION_ALLOWED = false`
