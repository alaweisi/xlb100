# Three-App Android M5 Simulation RC Acceptance

Date: 2026-07-26

## Decision

Customer, Worker, and Admin Android M5 release gates pass for the simulation
operations release candidate:

- `releaseCandidate`: `true`
- `published`: `false`
- payment, SMS, and map providers remain simulated
- no store upload or public production release was performed

## HTTPS origin

The three APKs use the same Tencent Cloud simulation API origin:

`https://123.207.198.136:80`

The non-standard HTTPS port is intentional. Tencent Cloud security-group access
currently permits public TCP 80 but blocks public TCP 443. HAProxy inspects the
connection protocol on port 80 and routes:

- plain HTTP to the existing cloud-staging Nginx HTTP listener;
- TLS to the Nginx HTTPS listener.

The certificate is a publicly trusted Let’s Encrypt short-lived IP certificate
whose SAN contains `123.207.198.136`. Certbot 5.7.0 owns automatic renewal.
The renewal pre/deploy/post hooks stop and restore only the edge proxy, and two
dry-run renewals passed. Standard `https://123.207.198.136` will become
externally reachable after Tencent Cloud opens TCP 443; a later APK can move
from the temporary `:80` origin to the standard origin while retaining the
same Android signing identity.

Public smoke returned HTTP 200 for:

- `/health`
- `/customer/`
- `/worker/`
- `/admin/`
- `/oa/`
- `/dashboard/`

over `https://123.207.198.136:80`.

## Signing custody

Three distinct RSA-4096 JKS signing identities were generated outside the Git
workspace under the current Windows user's private XLB directory. The
credential loader and keystores are ACL-restricted to that Windows user and
`SYSTEM`. Nothing under that private directory is tracked by Git.

The private signing directory must be copied to at least two separate encrypted
offline storage devices. Losing one of these signing identities prevents
in-place updates to the corresponding published Android application.

Public certificate fingerprints:

| Role | Certificate SHA-256 |
| --- | --- |
| Customer | `4030F5CB3244CEAF5CBDA669ED95978A68ED966AF69C0E53B7698A2531F1D2EE` |
| Worker | `C597953DC8DE63CFB0DF21C041D9577B61E0BEB057E1959D15327169CD8F274B` |
| Admin | `D9EA1A3B3FB08CBF7F3229EFDFEAD29DEF4E5FDF9CE690DEA02381A645C52876` |

## APK inventory

| Role | Version | Bytes | APK SHA-256 |
| --- | --- | ---: | --- |
| Customer | `0.1.0 (1)` | 3,269,974 | `E97684365985889159F2BAF019CA9967A79C10FEE2CA0CB026D444C53BD769DA` |
| Worker | `0.1.0 (1)` | 3,253,123 | `87B6501AA5EED1B645244B3978DBB06F00750CB4755A9F46CE33238D2AAC20E3` |
| Admin | `0.1.0 (1)` | 3,277,989 | `1B4F19ED03FF84CF29F2D4F6D620328F8D67E4DEF39D70C7AFB738CFA230782A` |

All three certificate fingerprints and public-key fingerprints are distinct.

## Android runtime evidence

The three release APKs were uninstalled/reinstalled on the API 34 emulator,
resolved to their own `MainActivity`, cold-started, and retained a live process.

- crash-buffer lines: `0` for all three applications
- fatal/ANR signals: `0`
- TLS, certificate, and cleartext rejection signals: `0`
- Customer completed bootstrap and rendered the Hangzhou service catalog from
  the Tencent Cloud simulation API
- Worker rendered the native login/task-pool layout
- Admin rendered the native settlement layout and reached the cloud API; the
  test admin session still receives the previously known authorization `403`

The remaining Admin authorization behavior does not invalidate APK signing,
HTTPS transport, installation, or the M5 release construction gate. It remains
a simulation-environment business UAT item and must be closed before a public
production launch.

## Final gates

- `pnpm mobile:m5:release`: PASS
- five-end build: 13/13 tasks PASS
- mobile foundation and three-shell tests: 39/39 PASS
- Customer API-origin unit tests: 3/3 PASS
- full unit/contract suite: 1,129 PASS, 1 todo
- full isolated database suite: 641 PASS, 1 environment-dependent skip
- Docker Compose configuration: PASS
- Nginx configuration: PASS
- HAProxy configuration: PASS
- Certbot automatic-renewal dry run: PASS
