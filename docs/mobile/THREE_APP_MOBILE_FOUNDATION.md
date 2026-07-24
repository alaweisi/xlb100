# XLB Three-App Mobile Foundation

## Boundary

`packages/mobile-foundation` is the common M0-F layer for three independent
Capacitor Android shells. It centralizes only repeatable engineering policy:

- a runtime-validated app descriptor plus JSON Schema;
- `development`, `test`, and `production` API profiles;
- web build → Capacitor sync → Gradle orchestration;
- JDK, Android SDK, and Gradle wrapper discovery;
- debug-only cleartext generation and production-cleartext validation;
- Application ID, version, app name, permission, backup, and network boundary
  checks in app-owned source and in the final APK/merged Manifest through
  Android `aapt`.

Each shell has its own `apps/<role>-mobile` workspace package and descriptor.
Its Android project, Manifest, Gradle configuration, icon,
splash, signing material, permission list, and network-security XML remain
app-owned. There is deliberately no shared Manifest, Android project, signing
configuration, or maximum permission set.

The public JavaScript API is exported from `@xlb/mobile-foundation`; the JSON
Schema is exported from `@xlb/mobile-foundation/schema`. `xlb-mobile` is the
common CLI. The descriptor validates that production requires HTTPS and that
the debug cleartext host list exactly equals fixed HTTP profile hosts.

## Customer consumer

`apps/customer-mobile/mobile-app.config.mjs` is Customer's app-owned descriptor.
`capacitor.config.ts`, build scripts, environment resolution, toolchain
discovery, generated debug network policy, and boundary tests consume the
common package. Customer source remains in `apps/customer`; no page or business
module is copied.

Root commands:

```powershell
pnpm mobile:foundation:test
pnpm mobile:m0:test
pnpm mobile:m0:typecheck
pnpm mobile:m0:validate
pnpm mobile:m0:doctor
pnpm mobile:m0:android:debug
pnpm mobile:customer:validate
pnpm mobile:customer:doctor
pnpm customer:mobile:web:test
pnpm customer:mobile:android:debug
pnpm worker:mobile:web:test
pnpm worker:mobile:android:debug
pnpm admin:mobile:web:test
pnpm admin:mobile:android:debug
```

Customer cloud/web construction remains:

```powershell
pnpm --filter @xlb/customer build
```

The mobile-only Vite invocation forces `--base ./` and writes to
`apps/customer-mobile/dist`; it does not alter `apps/customer/vite.config.ts` or
the cloud build output.

## Worker consumer

`apps/worker-mobile` builds the existing `@xlb/worker` source without copying
pages. Its independent Android identity is `com.xlb100.worker`, display name is
`喜乐帮师傅端`, and the M0 foundation version is `1` / `0.1.0`. Worker uses its
existing `VITE_API_BASE` variable and a mobile-only `./` base.

Worker's current location UI accepts manually entered coordinates and does not
use browser geolocation or a native bridge. Its M0 Manifest therefore declares
only `INTERNET` and `ACCESS_NETWORK_STATE`; it does not pre-authorize location,
camera, storage, microphone, or background capabilities.

## Admin consumer

`apps/admin-mobile` builds the existing `@xlb/admin` source without copying
pages. Its independent Android identity is `com.xlb100.admin`, its display name
retains the repository fact `喜乐帮 · A端`, and its M0 foundation version is
`1` / `0.1.0`. Admin uses its existing `VITE_API_BASE`, hash navigation, and a
mobile-only `./` base.

Admin M0 declares only `INTERNET` and `ACCESS_NETWORK_STATE`. It does not inherit
Customer or Worker permissions.

## Three-app security and release boundary

All three shells load bundled assets and have no Capacitor `server.url`.
The test profile fixes the API origin to `http://123.207.198.136`; only the
debug source set allows cleartext to that exact host and does not include
subdomains. Development and production require an explicit HTTPS origin, and
the main/release network configuration denies cleartext.

The three Android projects, version streams, icons, signing material, and
release processes remain independent. M0 produces debug APKs only; release
signing, runtime native bridges, device permission UX, App Links, production
observability, final brand assets, and physical-device UAT remain later-phase
inputs.
