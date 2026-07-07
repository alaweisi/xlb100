# Customer Capacitor Readiness Plan

## Purpose

Customer readiness files are prepared for future native wrapping, but this phase only establishes shell prerequisites and constraints.

- Capacitor is treated as a **WebView app shell**.
- It is **not** a replacement for UI correctness, workflow validation, or backend-driven business acceptance.
- It can only host the existing Customer web experience under an app container.

## Scope in this phase

- Add `apps/customer/capacitor.config.ts`.
- Add web manifest and initial icon assets under `apps/customer/public`.
- Keep `webDir` and static packaging settings explicit.
- Do not introduce any new business endpoint, payment logic, dispatch logic, qualification logic, or admin paths.

## Explicit out-of-scope items

- No new backend campaign/order/dispatch logic.
- No ios/android native project directories.
- No APK/IPA build.
- No app store release.
- No production deployment.

## Readiness facts (now)

- Shell mode for real mobile already follows the customer app-shell correction from the previous gate.
- Business page behavior remains unchanged in this phase.
- This phase only adds readiness artifacts and operating constraints.

## 预期后续触发条件

进入真正 `npx cap add ios` / `npx cap add android` 之前，必须先完成：
- C 端主链路 staging UAT 通过；
- Customer shell 在真实手机上不再出现“手机壳套手机壳”；
- App HTTPS 域名和 `manifest.webmanifest`、PWA 元数据齐备；
- icon 与 splash 基础资产准备；
- privacy policy 文档与披露链路；
- Android Studio 环境可用；
- iOS 需满足 macOS/Xcode 环境或可替代云构建链路。
