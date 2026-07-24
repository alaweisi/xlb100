# `@xlb/mobile-foundation`

Shared, business-agnostic infrastructure for the three independent XLB
Capacitor Android shells.

The package owns:

- the runtime-validated mobile app descriptor and its JSON Schema;
- `development`, `test`, and `production` API profiles;
- web build → Capacitor sync → Gradle orchestration;
- JDK, Android SDK, and app-owned Gradle wrapper discovery;
- generation and strict validation of debug-only cleartext host overrides;
- Application ID, version, app name, permission, backup, and production
  cleartext boundary validation, both in app-owned source and in the final APK
  metadata/merged Manifest through Android `aapt`.

Each app still owns its descriptor, `android/` project, Manifest, Gradle files,
icons, signing, permissions, and network-security resources. The package never
defines a shared permission list or a shared Android project.

Public imports are exposed from `@xlb/mobile-foundation`; the machine-readable
schema is exported as `@xlb/mobile-foundation/schema`. The `xlb-mobile` CLI is
the common command surface. See `docs/mobile/THREE_APP_MOBILE_FOUNDATION.md`.
