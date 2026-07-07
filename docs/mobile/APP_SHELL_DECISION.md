# App Shell Decision

## Context

Customer now has two shell modes:

- **Desktop / Figma preview mode**: keeps the framed mock-device composition for desktop inspection and visual QA alignment.
- **Real phone app mode**: removes phone chrome and lets the page render as app-native width/height on real mobile touch devices.

## Rule

- Do not mix them.
- Desktop view still uses Figma frame preview.
- Mobile phones must render as plain app surface (no fake frame, no fake status bar), with fixed bottom navigation and safe-area offset.

## Enforcement notes

- Keep existing shell mode detection by viewport and touch heuristics.
- Ensure the app shell change is additive and does not alter workflow actions, catalog/pricing/order/payment wiring, or auth/profile semantics.
- Mobile shell behavior is an infrastructure/readiness concern; it does not change business acceptance logic.

## 进入 `npx cap add ios/android` 前提

- C 端主链路 staging UAT 通过；
- Customer shell 不再显示假手机框；
- HTTPS 域名准备并可稳定访问；
- icon / splash 资源就绪；
- privacy policy 已准备；
- Android Studio 可用；
- iOS 需要 macOS/Xcode 或可行的云构建方案；
- 生产发布和 APK/IPA 打包仍在后续阶段。
