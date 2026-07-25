# XLB Three-App Mobile M4 Acceptance

Date: 2026-07-25

Gate status: **PARTIAL PASS — API 34 emulator hardening and regression pass;
the full gate remains blocked by unavailable Worker cloud authentication,
unimplemented Customer system-location resolution, missing API 24/API 36 and
physical-device coverage, and an unsuitable performance AVD.**

## Device and build under test

- AVD: `XLB_M1_API_34`
- adb serial: `emulator-5554`
- Android: 14 / API 34
- baseline display: 1080 × 2400 at 420 dpi
- variants: three test-profile debug APKs
- packages: `com.xlb100.customer`, `com.xlb100.worker`,
  `com.xlb100.admin`

The emulator display overrides used by the responsive matrix were reset to
1080 × 2400 at 420 dpi after the run.

## Responsive and safe-area matrix

Worker and Admin now declare `viewport-fit=cover`, matching Customer. The
role-adaptation tests enforce that declaration together with the existing
safe-area CSS.

The installed apps were brought to the foreground at each profile. WebView
DevTools accepted only a stable `https://localhost` target with a non-zero
viewport; transient `about:blank` targets were discarded.

| Profile | CSS viewport | Customer | Worker | Admin |
| --- | --- | --- | --- | --- |
| compact | 360 × 582 | no root horizontal overflow | no root horizontal overflow | no root horizontal overflow |
| phone | 412 × 842–866 | no root horizontal overflow | no root horizontal overflow | no root horizontal overflow |
| tablet | 800 × 1152 | no root horizontal overflow | no root horizontal overflow | no root horizontal overflow |

Admin's phone document height was 1287 CSS px and Worker's tablet document
height was 1208 CSS px. Both remained vertically scrollable without expanding
the document beyond the viewport width.

## Lifecycle, network and permissions

- Each package survived repeated `am force-stop` and cold relaunch with its
  bundled `https://localhost` assets.
- All three packages cold-launched while Android airplane mode was enabled.
  Airplane mode was then disabled and the device configuration restored.
- M1 already covered Customer background/foreground, keyboard resize,
  offline/recovery and Android back behavior. M4 repeated process-death and
  offline local-asset startup across all three packages.
- Customer's foreground location permissions were exercised through both
  granted and denied system states. The final device state was restored to
  denied.
- Worker and Admin request no camera, microphone, location, background
  location or storage permissions.
- Worker evidence uses the system document picker with JPEG, PNG and WebP
  input constraints, so it does not inherit camera or storage permission.
  The authenticated upload flow remains blocked by Worker cloud auth.

## Stability and diagnostics

- Crash buffer matches for XLB packages: 0.
- XLB fatal-exception, fatal-signal and ANR matches: 0.
- bearer/JWT/OTP/debug-code matches in the captured logcat: 0.
- Exit history contained only expected force-stop, package-update,
  permission-change and WebView isolated-process cleanup reasons.
- Stable-process memory snapshots were approximately 64–67 MiB total PSS on
  this emulator.

The AVD has GPU acceleration disabled and only 1536 MiB RAM. Its focused
`gfxinfo` samples contained too few frames and reported 85–100% jank, so those
numbers were rejected rather than treated as product performance evidence.
M4 performance remains open for a GPU-enabled emulator or physical device.

## Automated regression

The relevant repeatable gates are:

```powershell
pnpm mobile:m0:test
pnpm mobile:m0:typecheck
pnpm mobile:m0:validate
pnpm mobile:m3:gate
```

The M3 command continues to use and remove an isolated test database.

The 2026-07-25 regression passed:

- 33 mobile-foundation and three-shell tests;
- all four mobile TypeScript checks;
- all three descriptor/permission/network validations;
- both formal M3 database journeys, with isolated database
  `xlb_test_1784976196202_26632` removed after the run.

## Open M4 gates

1. Tencent still returns 404 for the Worker code and debug-code routes, which
   blocks Worker session, business-flow, file-picker upload and expiry replay.
2. Customer's location coordinator currently fails closed with
   `gap_06_location_unavailable`; system permission state is real, but
   coordinate resolution and approved service-city mapping are not connected.
3. Admin does not yet have a centralized API-401 session-expiry transition.
   That is an authentication-boundary change and requires the explicit
   high-risk confirmation before implementation.
4. No API 24, API 36 or physical Android device is connected. This report does
   not claim minimum-SDK, target-SDK or real-device acceptance.
5. Weak-network latency shaping, authenticated Worker image upload and
   GPU-backed performance traces remain open.
