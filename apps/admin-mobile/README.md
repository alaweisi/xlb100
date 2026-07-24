# Admin Mobile M0 Android Shell

`@xlb/admin-mobile` is an independent Capacitor 8 Android shell for the existing
`@xlb/admin` React application. It owns no Admin page, business contract, or
native business bridge.

## Shared-code boundary

- Web source of truth: `apps/admin`.
- Mobile web output: `apps/admin-mobile/dist` (generated and ignored).
- App-owned native project: `apps/admin-mobile/android`.
- The mobile build runs Vite against `apps/admin`; it does not copy or fork
  Admin source.
- The existing Admin cloud build remains `pnpm --filter @xlb/admin build`.
- Only the mobile invocation overrides Vite to `base: "./"`.

## Environment and network boundary

| Profile | API origin | Cleartext |
| --- | --- | --- |
| development | Explicit `XLB_ADMIN_MOBILE_API_BASE_URL`; HTTPS required | denied |
| test / debug APK | Fixed `http://123.207.198.136` | allowed only for that exact host |
| production / release APK | Explicit `XLB_ADMIN_MOBILE_API_BASE_URL`; HTTPS required | denied |

The Capacitor config has no `server.url`; every APK loads bundled web assets.
The test origin is compiled only into the test web bundle. The main Android
network security config denies cleartext, while the debug source set permits
only `123.207.198.136` with subdomains disabled. No secret belongs in a
`VITE_*` value.

The Admin Web currently relies on browser HTTP and same-origin behavior. Before
M1 business UAT, approve and verify the mobile HTTPS ingress and CORS contract;
M0 does not bypass browser security through a native bridge.

## Android identity and minimum permissions

- Application ID: `com.xlb100.admin`
- Display name: `喜乐帮 · A端` (the existing Admin Web title)
- Version: `versionCode 1`, `versionName 0.1.0`
- Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`
- No location, camera, storage, microphone, contacts, telephony, notification,
  background location, or package-query permission is declared.
- No Capacitor business plugin or runtime permission flow is included in M0.

## Build and verification

Run from the monorepo root:

```powershell
pnpm install --lockfile=false
pnpm --filter @xlb/admin-mobile test
pnpm --filter @xlb/admin-mobile typecheck
pnpm --filter @xlb/admin-mobile mobile:validate
pnpm --filter @xlb/admin-mobile mobile:doctor
pnpm --filter @xlb/admin typecheck
pnpm --filter @xlb/admin build
pnpm --filter @xlb/admin-mobile build:debug
```

Development bundled assets require an explicit HTTPS API origin:

```powershell
$env:XLB_ADMIN_MOBILE_API_BASE_URL = "https://dev-api.example.com"
pnpm --filter @xlb/admin-mobile web:build:development
pnpm --filter @xlb/admin-mobile cap:sync
```

Production/release construction requires an explicit HTTPS origin and release
signing supplied outside M0:

```powershell
$env:XLB_ADMIN_MOBILE_API_BASE_URL = "https://api.example.com"
pnpm --filter @xlb/admin-mobile build:release
```

A successful debug build writes:

`apps/admin-mobile/android/app/build/outputs/apk/debug/app-debug.apk`

The shared runner normally uses the app-owned wrapper and normalizes the JDK and
Android SDK paths. `XLB_GRADLE_EXECUTABLE` is an optional local-only fallback
for a pre-verified Gradle executable when a controlled network cannot download
the pinned wrapper distribution; do not commit a machine-specific path.

## M1 inputs

- Approved mobile HTTPS API hostname and CORS/origin policy.
- Physical-device UAT for authentication, navigation, process restore, network
  loss, keyboard/safe areas, and Android back behavior.
- Final replaceable brand icon/splash assets.
- Release signing custody, version-increment policy, privacy disclosures, and
  store metadata.
- Deep links / App Links and production observability decisions.
