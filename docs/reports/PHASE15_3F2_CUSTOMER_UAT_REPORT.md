# Phase 15.3F-2 Customer Product UAT Recovery Report

## Mobile Shell Gatefix

Phase 15.3F-2-MOBILE-SHELL-GATEFIX fixes the Customer shell behavior for real phones.

Before this gatefix, cloud-staging rendered the desktop Figma device preview inside a real mobile browser, creating a phone-frame-inside-phone experience. This gatefix keeps the Figma device preview for desktop review while switching Customer to real app mode on mobile/touch viewports.

## Changes

- `packages/ui`:
  - Added `MobileShell` mode support: `desktop` / `preview` and `mobile` / `app`.
  - Added `BottomNav` placement support for `static` and `fixed`.
  - `app` mode uses `100dvh` as the minimum shell height.
- `apps/customer`:
  - Added responsive Customer shell detection using viewport and coarse pointer checks.
  - Desktop keeps the Figma phone preview frame.
  - Mobile/touch mode removes the gold device border, fake status bar, rounded device frame, shadow, and preview margins.
  - Mobile/touch mode uses `100vw`, `100dvh`, and fixed bottom navigation with `env(safe-area-inset-bottom)`.

## Business Boundary

Customer UAT flow is unchanged:

- catalog API remains real.
- pricing quote API remains real.
- order create API remains real.
- payment order create API remains real.
- order detail re-read remains real.
- UAT folded panel remains available.

No fake order, fake user, fake payment success, or fake dispatch state was added.

## Scope

- Worker: not modified.
- Admin: not modified.
- Backend/db/deploy/infra: not modified.
- Production: NO-GO.
- Tag: not created.

## Verification

Pending final validation for this commit:

- `pnpm --filter @xlb/ui typecheck`
- `pnpm --filter @xlb/ui build`
- `pnpm --filter @xlb/customer typecheck`
- `pnpm --filter @xlb/customer build`
- `pnpm test -- --bail=1`
