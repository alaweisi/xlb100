# Three-App Mobile Android M1–M5 Execution

Date started: 2026-07-25

## Construction boundary

- The only Git repository and physical construction site is `G:\xlb100`.
- Work runs on the in-place branch `codex/three-app-mobile-m1-m5`.
- No second clone, Git worktree, or off-site XLB build directory is permitted.
- Android Virtual Devices are test devices, not construction sites.
- The three apps remain one monorepo program:
  - Customer: `apps/customer` + `apps/customer-mobile`
  - Worker: `apps/worker` + `apps/worker-mobile`
  - Admin: `apps/admin` + `apps/admin-mobile`
  - Common mobile capability: `packages/mobile-foundation`

## Phase ledger

| Phase | Scope | Work units | Gate | Status |
| --- | --- | --- | --- | --- |
| M1 | Cloud runtime and device bootstrap | Common, Customer, Worker, Admin | Tests, three APK builds, emulator runtime, authentication/session/device lifecycle | In progress; Worker cloud auth routes block final gate |
| M2 | Role-native and business adaptation | Customer, Worker, Admin, common UI capability | Role flow tests, builds, emulator visual and interaction acceptance | Local work complete; runtime gate inherits the Worker cloud-auth blocker |
| M3 | Official three-app business E2E | Customer, Worker, Admin, shared contracts | Official business journeys and cross-role state acceptance | Formal isolated data-plane gate passes; APK cloud journey blocked by Worker auth |
| M4 | Android device QA and hardening | Common plus three app-specific units | Device matrix, lifecycle, network, performance, permissions and regression | API 34 emulator partial pass; device, auth, location and performance gaps remain |
| M5 | Internal release candidates | Customer, Worker, Admin, release common capability | Release builds, signing boundary, hashes, install documentation and RC acceptance | Queued; no publication authority |

An M5 APK remains a release candidate until the Human Owner separately
authorizes upload, deployment, publication, or any other external release.

## M1 work packages

### Common

- Keep all UI assets bundled; never configure a remote Capacitor `server.url`.
- Route WebView `fetch`/XHR through Capacitor native HTTP on Android so the
  bundled `https://localhost` origin can reach the fixed HTTP test API.
- Keep Android cleartext access restricted to the exact debug host and keep
  production profiles HTTPS-only.
- Disable Capacitor bridge logging of HTTP payloads.
- Route Android back through SPA history before leaving an app.

### Customer

- Verify cloud OTP login, persisted session, logout, Customer role binding,
  cross-role denial, background/foreground, process restart, keyboard, offline
  failure and recovery.

### Worker

- Verify install and cold start.
- Verify worker OTP request, debug-code retrieval, login, session and logout
  when the cloud worker auth routes are available.

### Admin

- Verify cloud OTP login, persisted session, logout, Admin role binding and
  cross-role denial.

Detailed evidence and the remaining M1 blocker are recorded in
`docs/mobile/M1_ACCEPTANCE.md`.

## M2 work packages

### Customer

- Reuse the completed Customer mobile layouts and registered slice runtime.
- Revalidate entry, location, service discovery/detail, checkout, payment
  fail-closed boundary, orders, coupons, aftersale, refunds, reviews and
  notifications without changing Catalog, prices or state machines.

### Worker

- Remove the desktop phone-preview frame at native Android widths.
- Preserve task-pool, fulfillment, evidence, wallet, support, profile and
  certification flows.
- Keep Worker permissions at Internet and network state only until a real
  native location/camera/file workflow is authorized.

### Admin

- Convert the fixed desktop side rail to a touch-sized horizontal navigation
  rail at Android widths.
- Keep tables internally scrollable without overflowing the whole page.
- Require a deliberate second activation for canonical SKU, certification,
  withdrawal and aftersale mutations.
- Preserve the existing no-provider-refund and no-provider-payout boundaries.

Detailed M2 evidence is recorded in `docs/mobile/M2_ACCEPTANCE.md`.

## M3 formal journey

The repeatable local gate is:

```powershell
pnpm mobile:m3:gate
```

It creates an isolated test database, applies the current migrations and
official seed chain, runs the authenticated three-role lifecycle and
cross-phase invariant tests, then drops the isolated database.

Detailed M3 evidence is recorded in `docs/mobile/M3_ACCEPTANCE.md`.

## M4 Android QA and hardening

The API 34 emulator gate now covers three stable responsive profiles, safe-area
viewport configuration, three-app process-death and offline local-asset
startup, scoped permission states, crash/ANR and sensitive-log scans, and
related regression gates. Performance data from the non-GPU AVD was rejected
as non-representative instead of being promoted to an acceptance result.

Detailed M4 evidence and the remaining device/auth/location gaps are recorded
in `docs/mobile/M4_ACCEPTANCE.md`.
