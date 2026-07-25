# XLB Android Release-Candidate Installation

This guide applies only after `pnpm mobile:m5:release` succeeds and its three
reports show distinct non-debug certificate and public-key fingerprints.

## Expected local outputs

```text
apps/customer-mobile/android/app/build/outputs/apk/release/app-release.apk
apps/worker-mobile/android/app/build/outputs/apk/release/app-release.apk
apps/admin-mobile/android/app/build/outputs/apk/release/app-release.apk
```

Verify the SHA-256 and certificate fingerprints against the JSON printed by
the same gate run before transferring any APK.

## Install

With exactly one intended Android target visible in `adb devices`:

```powershell
adb install apps/customer-mobile/android/app/build/outputs/apk/release/app-release.apk
adb install apps/worker-mobile/android/app/build/outputs/apk/release/app-release.apk
adb install apps/admin-mobile/android/app/build/outputs/apk/release/app-release.apk
```

For an upgrade signed by the same role certificate:

```powershell
adb install -r <role-apk-path>
```

An installed debug APK cannot be upgraded in place to an independently signed
release APK. Android will reject the signature mismatch. Uninstalling first
removes that app's local data and session, so perform that destructive step
only on an approved test device.

## Permissions

- Customer: network state, Internet and foreground coarse/fine location.
- Worker: network state and Internet only.
- Admin: network state and Internet only.

Worker evidence selection uses the Android document picker and must not
request camera, microphone or broad storage permission.

## Investor/internal acceptance

For each role:

1. confirm app name, icon and splash;
2. install and cold-launch;
3. verify login, logout and expired-session behavior;
4. replay the same Customer → Worker → Customer → Admin order;
5. verify offline/error recovery and Android back behavior;
6. capture package version, APK SHA-256, certificate SHA-256 and device model;
7. scan logcat for crash, ANR and sensitive values.

Do not call the APK a release candidate if any M5 blocker in
`docs/mobile/M5_ACCEPTANCE.md` remains open.
