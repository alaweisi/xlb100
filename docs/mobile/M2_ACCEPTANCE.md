# XLB Three-App Mobile M2 Acceptance

Date: 2026-07-25

Gate status: **BLOCKED — M2 local implementation, builds and selected business
tests pass, but Worker cloud authentication remains unavailable, so Worker
business runtime acceptance cannot be completed.**

## Delivered role adaptation

### Customer

Customer already uses its mobile-first route, slice and component runtime. M2
did not duplicate or replace it. The existing implementation was revalidated
for:

- login entry and session guard;
- foreground location entry and refusal boundaries;
- home, Catalog-backed service discovery and service detail;
- checkout and order center;
- coupons;
- aftersale complaints and refund facts;
- review and notification flows;
- fail-closed payment behavior.

No Catalog/SKU, amount rule, order state machine, payment or refund fact was
changed.

### Worker

- The desktop preview frame, fake status row, inset padding and rounded device
  border are removed at widths up to 600px.
- Android safe-area top padding is applied to the real Worker header.
- The existing task, fulfillment, evidence, wallet, support, reputation,
  profile and certification implementations remain the business source.
- No camera, microphone, storage, foreground location or background location
  permission was added.

### Admin

- Shared UI layouts expose stable semantic hooks for Admin shell, top bar and
  side navigation.
- At widths up to 720px, the fixed 240px desktop rail becomes a sticky,
  horizontally scrollable 44px-minimum touch rail.
- The page itself stays one column; tables retain their own horizontal scroll.
- A shared two-step `ConfirmButton` protects canonical SKU changes, worker
  certification decisions, withdrawal decisions/mark-paid, order reverse
  decisions/apply, complaint repair/liability/compensation/resolution/close,
  and compensation-intent review.
- First activation arms the action; the second activation executes it. Moving
  focus away disarms it.
- No backend authorization, amount, payout, refund or state-machine rule was
  changed.

## Automated evidence

M2 selected business suites passed:

| Work package | Test files | Tests |
| --- | ---: | ---: |
| Customer | 14 | 125 |
| Worker | 4 | 28 |
| Admin | 7 | 80 |
| Total | 25 | 233 |

Additional mobile boundary/adaptation suites passed:

- Worker mobile: 8 tests
- Admin mobile: 8 tests

The following typechecks/builds passed:

```text
@xlb/ui typecheck
@xlb/customer mobile build inherited from the current debug APK
@xlb/worker typecheck and Worker debug APK build
@xlb/admin typecheck, production Web build and Admin debug APK build
```

## Emulator evidence

Runtime device: API 34 AVD `XLB_M1_API_34`, 1080 × 2400 physical pixels,
412 CSS pixels wide.

### Worker

- whole-document width: 412px / viewport 412px;
- whole-page horizontal overflow: false;
- preview frame border: 0px;
- preview status row: hidden;
- minimum bottom-navigation target height: 71px.

Screenshot:

```text
apps/worker-mobile/android/app/build/reports/m2/worker-login.png
```

### Admin

- whole-document width: 412px / viewport 412px;
- whole-page horizontal overflow: false;
- navigation items: 13;
- navigation is horizontally scrollable;
- minimum navigation target height: 44px.

Screenshot:

```text
apps/admin-mobile/android/app/build/reports/m2/admin-dashboard.png
```

The current cloud Admin settlement audit request returns 403. The shell,
authentication, role navigation and responsive content render correctly, but
that deployed permission/version mismatch remains a later cloud-runtime input.

## Permissions

| App | M2 Android permissions |
| --- | --- |
| Customer | Internet, network state, foreground coarse/fine location |
| Worker | Internet, network state |
| Admin | Internet, network state |

Admin does not inherit Customer location permission. Worker does not request
camera, microphone, storage or location merely because a future workflow could
use them.

## Debug APK evidence

| App | Bytes | SHA-256 |
| --- | ---: | --- |
| Customer | 5,244,821 | `E85CBBE20D72148D2C7A94F011E9BAC7B98A7533ADC01A7215351F07C6880779` |
| Worker | 4,320,718 | `32518115ECFF71198547289F57A7838CFCD170E368E2E38A6F0E939EC81C340B` |
| Admin | 4,408,594 | `1F999DD3B21F38B8830691CF58D48A5A77EFA735D2F713C29C8FF05838CEEB38` |

These are local debug APKs, not release candidates.

## Remaining gate blocker

The Tencent test runtime returns 404 for Worker authentication code and
debug-code routes. Until that cloud version/config is reconciled, M2 cannot
prove the Worker task, accept and fulfillment flows in the APK with a real
Worker session.

No Demo/Mock login or fabricated business state was introduced. Tencent
deployment remains an external operation requiring separate Human Owner
authorization.
