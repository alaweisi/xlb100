# XLB Three-App Mobile M0 Acceptance

Date: 2026-07-25

## Delivered architecture

The XLB monorepo now contains one common, non-deployable mobile engineering
foundation and three independently buildable Android shell applications:

```text
packages/mobile-foundation
apps/customer-mobile  -> apps/customer
apps/worker-mobile    -> apps/worker
apps/admin-mobile     -> apps/admin
```

The shells invoke their existing Web application's Vite build. They do not copy
pages, registries, domain state, contracts, or business data. Each shell owns
its Capacitor descriptor, Android project, Application ID, display name,
version, Manifest, permissions, network policy, resources, and later release
signing.

## M0 identities and permissions

| Shell | Application ID | Display name | Source permissions |
| --- | --- | --- | --- |
| Customer | `com.xlb100.customer` | `喜乐帮到家` | Internet, network state, foreground coarse/fine location |
| Worker | `com.xlb100.worker` | `喜乐帮师傅端` | Internet, network state |
| Admin | `com.xlb100.admin` | `喜乐帮 · A端` | Internet, network state |

All three use `versionCode 1`, `versionName 0.1.0`, minimum SDK 24, and target
SDK 36. Worker does not request location in M0 because its current location
surface only accepts manually entered coordinates. Admin does not inherit
Customer or Worker permissions.

## Environment and network boundary

- Every APK loads bundled Web assets; no shell defines Capacitor `server.url`.
- Mobile Web assets use `./`; existing cloud builds retain `/customer/`,
  `/worker/`, and `/admin/`.
- Test bundles use the fixed origin `http://123.207.198.136`.
- Only the debug source set permits cleartext to that exact host, with
  `includeSubdomains=false`.
- Development and production profiles require an explicit HTTPS origin.
- Main/release manifests and packaged release network resources deny
  cleartext.

## Reproducible commands

```powershell
pnpm install --frozen-lockfile
pnpm mobile:m0:test
pnpm mobile:m0:typecheck
pnpm mobile:m0:validate
pnpm mobile:m0:doctor

$env:XLB_GRADLE_EXECUTABLE = "C:\path\to\verified\gradle.bat" # only when the wrapper download is unavailable
pnpm mobile:m0:android:debug
```

Individual build commands are:

```powershell
pnpm customer:mobile:android:debug
pnpm worker:mobile:android:debug
pnpm admin:mobile:android:debug
```

## Verified debug artifacts

| Shell | Bytes | SHA-256 |
| --- | ---: | --- |
| Customer | 5,242,710 | `07E107162E7DC358C04E321302BB96B22742A927A6A1A50ABCC8C556CD2B5623` |
| Worker | 4,257,549 | `42C1425C85A1C2E618A454C846DBBE8F657579589F1F86C4A43AAD1E57048695` |
| Admin | 4,282,496 | `6B8042991630004999FE4AE00AFCD091637DB66A87CB820C5CAAB845DD321B67` |

Each artifact is written to:

```text
apps/<role>-mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

The shared validator and an independent `aapt` inspection verified each final
APK's ID, display name, version, SDK levels, merged permissions, backup policy,
and cleartext boundary.

## Environment evidence

The machine has a working Temurin JDK 21 and Android SDK/API 36. The pinned
Gradle 8.14.3 wrapper distribution could not be downloaded through the current
network and left a zero-byte partial file. All three end-to-end builds passed
with the foundation's explicit `XLB_GRADLE_EXECUTABLE` escape hatch pointing to
the machine's pre-verified Gradle 8.14 installation. This is an environment
download limitation, not an application build failure.

## Later-phase inputs

M0 intentionally does not implement:

- runtime location, camera, notification, file, or other native bridges;
- physical-device authentication, process restore, keyboard, safe-area,
  Android-back, offline, and WebView navigation UAT;
- final replaceable launcher and splash brand assets;
- App Links/deep links and production observability;
- release signing custody, independent version-increment policy, privacy
  declarations, store metadata, publication, or deployment;
- approved production mobile HTTPS ingress and CORS/origin policy.

These are M1 or release-phase inputs and do not change the three-app M0
foundation boundary.
