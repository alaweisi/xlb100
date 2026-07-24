# Customer Mobile M0 Android Foundation

`@xlb/customer-mobile` is a Capacitor Android shell for the existing
`@xlb/customer` React / Hybrid SDUI application. It owns no Customer page,
Slice, SDUI Runtime, Registry, business contract, or business data.

Shared metadata, profiles, orchestration, toolchain discovery, and boundary
validation come from `@xlb/mobile-foundation`. Customer still owns
`mobile-app.config.mjs` and its complete native Android project. The three-app
contract and Worker/Admin audit inputs are documented in
`docs/mobile/THREE_APP_MOBILE_FOUNDATION.md`.

## Shared-code boundary

- Source of truth: `apps/customer/src`, `apps/customer/public`, and the existing
  `@xlb/*` workspace packages.
- Mobile web output: `apps/customer-mobile/dist` (generated and ignored).
- Native shell: `apps/customer-mobile/android`.
- The mobile build invokes Vite from `apps/customer`; it does not copy or fork
  Customer source files.
- The existing Customer cloud build remains `pnpm --filter @xlb/customer build`
  and continues to use `XLB_PUBLIC_BASE` (currently `/customer/` in staging).
- The mobile build overrides only its own invocation to `base: "./"` so bundled
  assets can be loaded from the Capacitor WebView.

## Environment boundary

| Profile | API origin | Cleartext |
| --- | --- | --- |
| development | Explicit `XLB_CUSTOMER_MOBILE_API_BASE_URL`; HTTPS required | denied |
| test / debug APK | Fixed `http://123.207.198.136` | allowed only for that exact host |
| production / release APK | Explicit `XLB_CUSTOMER_MOBILE_API_BASE_URL`; HTTPS required | denied |

The Capacitor config intentionally has no `server.url`; release artifacts always
use bundled web assets. The test address is compiled into the test web bundle,
not into the production profile. No secrets belong in any `VITE_*` value.

The current backend was designed for same-origin Web deployment. Before M1
business UAT, the mobile HTTPS ingress/CORS contract must be approved and
verified; M0 does not bypass browser security with a native HTTP bridge.

## Android identity and permissions

- Application ID: `com.xlb100.customer`
- Application name: `喜乐帮到家`
- Foundation version: `versionCode 1`, `versionName 0.1.0`
- Network: `INTERNET`, `ACCESS_NETWORK_STATE`
- Foreground location declaration: `ACCESS_COARSE_LOCATION`,
  `ACCESS_FINE_LOCATION`
- No background location, camera, contacts, storage, telephony, microphone,
  notification, or package-query permission is declared.
- Location permission is declaration-only in M0; no plugin or runtime request
  flow is implemented.

`android/app/src/main/res/xml/network_security_config.xml` denies cleartext by
default. The debug source-set override permits cleartext only to
`123.207.198.136`; release builds cannot consume that override.

## Build commands

From the monorepo root:

```powershell
pnpm install --frozen-lockfile
pnpm --filter @xlb/customer-mobile test
pnpm --filter @xlb/customer-mobile typecheck
pnpm mobile:customer:validate
pnpm mobile:customer:doctor
pnpm --filter @xlb/customer typecheck
pnpm --filter @xlb/customer build
pnpm --filter @xlb/customer-mobile build:debug
```

Development bundled web assets require an explicit HTTPS API origin:

```powershell
$env:XLB_CUSTOMER_MOBILE_API_BASE_URL = "https://dev-api.example.com"
pnpm --filter @xlb/customer-mobile web:build:development
pnpm --filter @xlb/customer-mobile cap:sync
```

Production/release construction also requires an explicit HTTPS origin and
release signing supplied outside M0:

```powershell
$env:XLB_CUSTOMER_MOBILE_API_BASE_URL = "https://api.example.com"
pnpm --filter @xlb/customer-mobile build:release
```

The shared toolchain runner validates and normalizes `JAVA_HOME`,
`ANDROID_HOME`, and `ANDROID_SDK_ROOT`, including the standard Windows SDK
location. `XLB_GRADLE_EXECUTABLE` is an optional local-only escape hatch for a
pre-verified Gradle executable when a controlled network cannot download the
pinned wrapper distribution; normal builds must leave it unset. A successful
debug build writes:

`apps/customer-mobile/android/app/build/outputs/apk/debug/app-debug.apk`

## M1 inputs

- Approved mobile HTTPS API hostname and CORS/origin policy.
- Runtime location permission UX and a selected, reviewed Capacitor plugin.
- Physical-device UAT for authentication, navigation, process restore, network
  loss, keyboard/safe areas, and Android back behavior.
- Final replaceable brand icon/splash assets (M0 retains the xlb100 baseline).
- Release signing custody, version-increment policy, privacy disclosures, and
  store metadata.
- Deep links / App Links and production observability decisions.
