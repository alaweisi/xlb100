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

Each future shell must have its own `apps/<role>-mobile` workspace package and
its own descriptor. Its Android project, Manifest, Gradle configuration, icon,
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
pnpm mobile:customer:validate
pnpm mobile:customer:doctor
pnpm customer:mobile:web:test
pnpm customer:mobile:android:debug
```

Customer cloud/web construction remains:

```powershell
pnpm --filter @xlb/customer build
```

The mobile-only Vite invocation forces `--base ./` and writes to
`apps/customer-mobile/dist`; it does not alter `apps/customer/vite.config.ts` or
the cloud build output.

## Worker inputs audited for the later Worker-Mobile branch

- Existing web package: `@xlb/worker`, version `0.0.0`.
- Web root: `apps/worker`; default Vite output: `apps/worker/dist`.
- Build: `tsc -p tsconfig.json --noEmit && vite build`, Vite 6 / React 18.
- Base path: `XLB_PUBLIC_BASE || "/"`; a mobile descriptor must override the
  isolated mobile build to `./`.
- API build variable: `VITE_API_BASE` (not Customer's
  `VITE_API_BASE_URL`); empty currently means same-origin.
- Router behavior reads `window.location.pathname`; the later branch must
  verify bundled-file navigation and Android back behavior.
- Confirmed npm identity is `@xlb/worker`. No Android Application ID, display
  name, version, permission set, cleartext test host, or signing policy exists
  in the current source. Those are required app-owned product inputs; M0-F does
  not invent them.

## Admin inputs audited for the later Admin-Mobile branch

- Existing web package: `@xlb/admin`, version `0.0.0`.
- Web root: `apps/admin`; default Vite output: `apps/admin/dist`.
- Build: `tsc -p tsconfig.json --noEmit && vite build`, Vite 6 / React 18.
- Base path: `XLB_PUBLIC_BASE || "/"`; a mobile descriptor must override the
  isolated mobile build to `./`.
- API build variable: `VITE_API_BASE`; empty currently means same-origin.
- Navigation is hash-based, which is compatible with bundled assets but still
  needs device/back-button UAT.
- Confirmed npm identity is `@xlb/admin`. No Android Application ID, display
  name, version, permission set, cleartext test host, or signing policy exists
  in the current source. Those are required app-owned product inputs; M0-F does
  not invent them.

This audit is intentionally input-only. It does not create `worker-mobile` or
`admin-mobile`.
