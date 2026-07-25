# XLB Three-App Mobile M1 Acceptance

Date: 2026-07-25

Gate status: **BLOCKED — local implementation and available runtime checks
pass, but the Tencent test runtime returns 404 for Worker authentication
routes.**

## Baseline and environment

- Branch: `codex/three-app-mobile-m1-m5`
- Baseline HEAD: `8eb03b36eddb911f07cbe74a1a6684c1ad2c6530`
- M0 ancestor: `97fe82a751b0c1f74683955056815f6c24b559d8`
- JDK: Eclipse Temurin 21.0.11
- Android SDK: `C:\Users\kong\AppData\Local\Android\Sdk`
- Gradle wrapper: 8.14.3
- Runtime device: clean API 34 Google APIs AVD `XLB_M1_API_34`
- API test origin: `http://123.207.198.136`

The system `JAVA_HOME` and `ANDROID_HOME` values were invalid at preflight.
Builds used the discovered working JDK and SDK explicitly without changing the
repository boundary.

## Delivered M1 common capability

- `CapacitorHttp.enabled=true` patches Android `fetch` and XHR through the
  native bridge. This removes WebView mixed-content/CORS failure for bundled
  assets without adding a remote WebView server URL.
- `loggingBehavior=none` prevents bridge console logging of OTP and token
  response bodies.
- Android cleartext remains denied by default. Only the debug source set
  permits the exact test host `123.207.198.136`; production profiles still
  require HTTPS.
- Customer, Worker and Admin now use the AndroidX back dispatcher. A hardware
  back action runs SPA `window.history.back()` when the WebView has history and
  leaves the Activity only at the root.

## Automated gate evidence

The following commands passed with the working JDK/SDK environment:

```powershell
pnpm mobile:m0:test
pnpm mobile:m0:typecheck
pnpm mobile:m0:android:debug
```

The mobile suite currently contains 31 passing tests:

- common mobile foundation: 11
- Customer mobile: 6
- Worker mobile: 7
- Admin mobile: 7

All reported suites have zero failures, cancellations, or skips.

## Emulator runtime evidence

| Check | Customer | Worker | Admin |
| --- | --- | --- | --- |
| Install and cold start | Pass | Pass | Pass |
| Bundled assets, no white screen | Pass | Pass | Pass |
| Cloud HTTP through native bridge | Pass | Pass | Pass |
| OTP request/debug-code/login | Pass | Blocked: cloud code and debug-code routes return 404 | Pass |
| JWT role | `customer` | Not available | `admin` |
| Session survives process/device restart | Pass | Blocked by login | Pass |
| Logout clears token | Pass | Blocked by login | Pass |
| Wrong-role API access denied | Customer token → Admin API: 403 | Blocked by login | Admin token → Customer API: 403 |
| Android back on SPA history | `/profile/addresses` → `/profile` pass | Shared native implementation built | Shared native implementation built |
| Background/foreground route preservation | Pass | App start pass | App start pass |
| Offline failure and recovery | Failure observed in airplane mode; `/health` returned 200 after recovery | Common transport | Common transport |
| Soft keyboard visibility | Focused Customer input remained inside resized visual viewport | Later role UI acceptance | Later role UI acceptance |
| Sensitive log scan | 0 JWT-like values, 0 OTP responses, 0 Capacitor console lines, 0 fatal exceptions | Same device scan | Same device scan |

The Worker and Admin Web layouts remain desktop-oriented on a narrow Android
viewport. That is an M2 role-adaptation input, not an M1 transport or startup
failure.

## Debug APK evidence

| App | Bytes | SHA-256 |
| --- | ---: | --- |
| Customer | 5,244,821 | `E85CBBE20D72148D2C7A94F011E9BAC7B98A7533ADC01A7215351F07C6880779` |
| Worker | 4,259,666 | `13CFC67B012718F5519D8FAB662583BEB4DE2586D7E467EE1B2E7DA632846637` |
| Admin | 4,284,606 | `22B45FB9518DF313FE713B98CA14B286925A25FD7282976D8004707E54613050` |

Artifacts are local debug APKs at:

```text
apps/<role>-mobile/android/app/build/outputs/apk/debug/app-debug.apk
```

They are not release candidates and have not been uploaded or published.

## Remaining M1 blocker

The repository backend registers:

```text
POST /api/auth/worker/code
GET  /api/auth/worker/debug-code
POST /api/auth/worker/login
```

The current Tencent test runtime returns 404 for the Worker code and
debug-code routes while equivalent Customer and Admin authentication routes
work. No fake OTP, relaxed authorization, or client-side bypass was added.

Closing this gate requires reconciling the deployed backend version/config and
then repeating Worker login, role, persistence and logout acceptance.
Deploying to Tencent is an external operation and requires separate Human Owner
authorization.
