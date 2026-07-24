# Worker Mobile M0 Android Shell

`@xlb/worker-mobile` is an app-owned Capacitor 8 Android shell for the
existing `@xlb/worker` React application. It does not copy Worker pages,
business state, API contracts, or business data, and it does not add a native
business bridge.

Shared metadata validation, environment profiles, build orchestration,
toolchain discovery, network-security generation, and source/APK boundary
validation come from `@xlb/mobile-foundation`. This package owns its descriptor,
native Android project, permission set, tests, and replaceable M0 brand assets.

## Shared-code boundary

- Source of truth: `apps/worker/src` and the existing `@xlb/*` workspace
  packages.
- Mobile web output: `apps/worker-mobile/dist` (generated and ignored).
- Native shell: `apps/worker-mobile/android`.
- The mobile build invokes Vite from `apps/worker`; it never copies or forks
  Worker source files.
- The existing Worker build remains `pnpm --filter @xlb/worker build`.
- Only the isolated mobile Vite invocation overrides `XLB_PUBLIC_BASE` and
  Vite's `base` to `./`, so bundled assets load in the Capacitor WebView.
- Worker API injection uses its existing `VITE_API_BASE` build variable.

## Environment and network boundary

| Profile | API origin | Cleartext |
| --- | --- | --- |
| development | Explicit `XLB_WORKER_MOBILE_API_BASE_URL`; HTTPS required | denied |
| test / debug APK | Fixed `http://123.207.198.136` | allowed only for that exact host |
| production / release APK | Explicit `XLB_WORKER_MOBILE_API_BASE_URL`; HTTPS required | denied |

The Capacitor config contains bundled `webDir: "dist"` assets and intentionally
has no `server.url`. The test origin is injected only into the test web bundle.
No secrets belong in `VITE_*` values.

`android/app/src/main/res/xml/network_security_config.xml` denies cleartext.
Only the debug source set allows cleartext, and only for the exact
`123.207.198.136` host with subdomains disabled. Release builds cannot consume
that debug override.

The current backend was designed for same-origin Web deployment. Before
business UAT, the mobile HTTPS ingress and CORS/origin policy must be approved
and verified; M0 does not bypass browser security with a native HTTP bridge.

## Android identity and permissions

- Application ID: `com.xlb100.worker`
- Application name: `喜乐帮师傅端`
- M0 version: `versionCode 1`, `versionName 0.1.0`
- Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`
- No foreground/background location, camera, contacts, storage, telephony,
  microphone, notification, or package-query permission is declared.

Worker currently has a location-reporting page, but it accepts manually entered
coordinates and does not call browser geolocation or a native plugin. Therefore
M0 needs no Android location permission. Existing file input remains a WebView
file chooser and does not justify pre-authorizing camera or storage.

## Build and validation

Install workspace dependencies without updating the shared lockfile when
working on this isolated branch:

```powershell
pnpm install --lockfile=false
```

Run the app-owned checks and the complete test/debug pipeline:

```powershell
pnpm --filter @xlb/worker-mobile test
pnpm --filter @xlb/worker-mobile typecheck
pnpm --filter @xlb/worker-mobile mobile:validate
pnpm --filter @xlb/worker-mobile mobile:doctor
pnpm --filter @xlb/worker typecheck
pnpm --filter @xlb/worker build
pnpm --filter @xlb/worker-mobile build:debug
```

`build:debug` performs the ordered Worker dependency build, isolated Worker Web
build, Capacitor Android sync, Gradle `assembleDebug`, and final APK validation
with Android `aapt`. The APK is written to:

`apps/worker-mobile/android/app/build/outputs/apk/debug/app-debug.apk`

For a development bundle, provide an explicit HTTPS API origin:

```powershell
$env:XLB_WORKER_MOBILE_API_BASE_URL = "https://dev-api.example.com"
pnpm --filter @xlb/worker-mobile web:build:development
pnpm --filter @xlb/worker-mobile cap:sync
```

Production/release construction also requires an explicit HTTPS origin and
release signing supplied outside M0:

```powershell
$env:XLB_WORKER_MOBILE_API_BASE_URL = "https://api.example.com"
pnpm --filter @xlb/worker-mobile build:release
```

The toolchain runner resolves `JAVA_HOME`, `ANDROID_HOME`, and
`ANDROID_SDK_ROOT`, including standard Windows locations. An app-owned Gradle
wrapper is committed. `XLB_GRADLE_EXECUTABLE` is only a local escape hatch for
a pre-verified Gradle executable when a controlled network cannot download the
pinned wrapper.

## M1 inputs

- Approved mobile HTTPS API hostname and CORS/origin policy.
- Physical-device UAT for authentication, WebView navigation and Android back,
  process restore, network loss, file chooser, keyboard, and safe areas.
- Product decision and UX for device-derived worker location; only then select
  and review a Capacitor location plugin and runtime permission flow.
- Final replaceable icon/splash assets, release signing custody, version policy,
  privacy disclosures, store metadata, deep links, and observability.
