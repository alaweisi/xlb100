# XLB Three-App Mobile M5 Acceptance

Date: 2026-07-25

Gate status: **BLOCKED — the local release-candidate framework is ready and
fails closed, but no release APK or publishable RC has been produced.**

## Fixed identities

| Role | Application ID | Name | versionCode | versionName |
| --- | --- | --- | ---: | --- |
| Customer | `com.xlb100.customer` | 喜乐帮到家 | 1 | 0.1.0 |
| Worker | `com.xlb100.worker` | 喜乐帮师傅端 | 1 | 0.1.0 |
| Admin | `com.xlb100.admin` | 喜乐帮 · A端 | 1 | 0.1.0 |

The app-owned descriptors, Gradle configuration and Android string resources
agree on these values.

## Release-candidate gate

The only complete three-app RC command is:

```powershell
pnpm mobile:m5:release
```

It runs the three release builds serially inside `G:\xlb100`, then:

1. validates package ID, label, version, permissions and merged network
   security with `aapt`;
2. verifies every APK with `apksigner`;
3. rejects an Android Debug certificate;
4. requires three distinct release certificate and public-key SHA-256
   fingerprints;
5. prints the APK path, byte count, SHA-256 and certificate identity;
6. reports `published: false`.

No APK is uploaded or published by this command.

## Required external inputs

Each role needs an approved HTTPS origin without a path, query or credentials:

```text
XLB_CUSTOMER_MOBILE_API_BASE_URL
XLB_WORKER_MOBILE_API_BASE_URL
XLB_ADMIN_MOBILE_API_BASE_URL
```

Each role also needs an independently controlled keystore and alias:

```text
XLB_CUSTOMER_ANDROID_KEYSTORE_PATH
XLB_CUSTOMER_ANDROID_STORE_PASSWORD
XLB_CUSTOMER_ANDROID_KEY_ALIAS
XLB_CUSTOMER_ANDROID_KEY_PASSWORD

XLB_WORKER_ANDROID_KEYSTORE_PATH
XLB_WORKER_ANDROID_STORE_PASSWORD
XLB_WORKER_ANDROID_KEY_ALIAS
XLB_WORKER_ANDROID_KEY_PASSWORD

XLB_ADMIN_ANDROID_KEYSTORE_PATH
XLB_ADMIN_ANDROID_STORE_PASSWORD
XLB_ADMIN_ANDROID_KEY_ALIAS
XLB_ADMIN_ANDROID_KEY_PASSWORD
```

All four signing values for a role must be present together. Release tasks
fail when any are missing. Keystores must exist outside the XLB workspace;
keystore files are ignored by all three Android projects and must never be
committed.

The fail-closed checks were exercised on 2026-07-25:

- the aggregate gate rejected the incomplete release environment;
- Gradle `assembleRelease` rejected missing Customer signing inputs;
- generic Gradle `assemble` also rejected the unsigned release variant through
  task-graph enforcement;
- all three debug Gradle builds continued to pass;
- 39 shared/shell tests passed, including release signer and public-key
  validation.

## Current APKs are not release candidates

Only debug APKs currently exist:

| Role | Bytes | SHA-256 |
| --- | ---: | --- |
| Customer | 5,244,821 | `E85CBBE20D72148D2C7A94F011E9BAC7B98A7533ADC01A7215351F07C6880779` |
| Worker | 4,320,718 | `C56C3727A3B134485C99BE2DEB98527C8C47AAF43024AB93EE0D09378D5F795C` |
| Admin | 4,408,594 | `A3EE5BDB1A1C4A4F6CC1046341050CAE5A95E33BE17DC18E9381E6EE2FE7F3D3` |

They share the Android Debug certificate
`EF64538BC76A129421552834EE25E9E2152F94A2EF5B8C96788691565E5559DF`
and therefore must not be renamed or represented as M5 RCs.

## Branding gate

The three Android launcher and splash resource sets are still the same
Capacitor default artwork. For example, all three `mipmap-hdpi` launcher
images have SHA-256
`72B71C3581CA3B5A23B1C168D69B9D855B3F184FA079902A01F088EB4F0607D5`.

Customer has a Web icon candidate, but Worker and Admin have no approved
role-specific brand assets. M5 requires approved launcher, adaptive/round icon
and Android splash assets before RC construction.

## Remaining M5 blockers

1. An approved and reachable mobile HTTPS API origin is missing.
2. Three independent release signing identities and their custody decision are
   missing.
3. Approved three-role launcher and splash assets are missing.
4. Tencent Worker authentication routes still return 404, so an RC could not
   pass the three-app business journey.
5. M4 still lacks physical-device, API 24/API 36 and GPU-backed performance
   acceptance.

Closing these items authorizes neither upload nor public release. Push,
distribution, store upload and production deployment remain separate external
operations requiring explicit approval.
