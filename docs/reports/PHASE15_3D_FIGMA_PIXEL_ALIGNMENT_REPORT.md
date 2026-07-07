# Phase 15.3D Figma Pixel Alignment Gap Audit

## Executive Conclusion

Commit `08e8355` must be treated as **Figma-inspired rough polish only**.

It completed zh-CN copy cleanup, reusable UI variants, and cloud-staging visibility, but it is **not** a high-fidelity Figma implementation. The current customer, worker, and admin screens do not yet reproduce the core Figma visual signatures: phone shell, thick role-colored frame, 390px composition, fixed bottom safe area, elevated rounded cards, customer raised create-order tab, worker radar surface, and admin dark purple mobile dashboard language.

## Scope

- Phase: 15.3D - Figma Pixel Alignment Repair Pass.
- Work performed: design-source re-read, missing frame PNG export, and gap audit.
- App code changes: none.
- `packages/**` changes: none.
- Backend/db/deploy/infra changes: none.
- Cloud deploy: not performed.
- Production: NO-GO.
- Tags: not created.

## Figma Re-Read

- Figma URL: `https://www.figma.com/design/WrIq7mTPz9zB5EJkftS3sY/Untitled?node-id=0-1&p=f&t=f3lEqJhifRddTPgx-0`
- File key: `WrIq7mTPz9zB5EJkftS3sY`
- Page node read by MCP: `0:1`
- Design root: `1:2` / `三端家居维修 App UI`
- MCP tools used:
  - `get_metadata`
  - `get_screenshot`
- Local export index:
  - `docs/design/figma/reports/PHASE15_3D_FRAME_EXPORT_INDEX.md`

## Newly Exported / Refreshed PNGs

| App | Frame | Node | Local PNG |
| --- | --- | --- | --- |
| customer | Customer / CreateOrder / Default | `1:594` | `docs/design/figma/frames/customer/customer_createorder_default_1-594.png` |
| customer | Customer / Orders / All | `1:824` | `docs/design/figma/frames/customer/customer_orders_all_1-824.png` |
| customer | Customer / OrderDetail / InProgress | `1:1013` | `docs/design/figma/frames/customer/customer_orderdetail_inprogress_1-1013.png` |
| worker | Worker / GrabHall / Online | `1:1515` | `docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png` |
| worker | Worker / GrabHall / Paused | `1:1647` | `docs/design/figma/frames/worker/worker_grabhall_paused_1-1647.png` |
| admin | Admin / Dashboard / Default | `1:2875` | `docs/design/figma/frames/admin/admin_dashboard_default_1-2875.png` |
| admin | Admin / WorkOrderPool / Default | `1:2968` | `docs/design/figma/frames/admin/admin_workorderpool_default_1-2968.png` |
| admin | Admin / Dispatch / Default | `1:3326` | `docs/design/figma/frames/admin/admin_dispatch_default_1-3326.png` |
| admin | Admin / MasterAudit / Default | `1:3513` | `docs/design/figma/frames/admin/admin_masteraudit_default_1-3513.png` |
| admin | Admin / Complaint / Default | `1:3649` | `docs/design/figma/frames/admin/admin_complaint_default_1-3649.png` |
| admin | Admin / AfterSale / Processing | `1:3711` | `docs/design/figma/frames/admin/admin_aftersale_processing_1-3711.png` |
| admin | Admin / AfterSale / Completed | `1:3736` | `docs/design/figma/frames/admin/admin_aftersale_completed_1-3736.png` |

## Scoring Method

Score range: 0-5.

- 0: no alignment or no design source.
- 1: very weak similarity.
- 2: rough thematic similarity.
- 3: partial structural alignment.
- 4: close visual alignment with minor deviations.
- 5: high-fidelity alignment.

Columns:

- layout
- color
- typography
- card density
- bottom navigation
- state components
- business boundary

## Route -> Figma Frame -> Current Implementation Gap Matrix

| Route | Figma source | Current 08e8355 status | Layout | Color | Typography | Card density | Bottom nav | State components | Business boundary | Notes |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| `/customer/` | `Customer / Home / Default` (`1:228`) | Figma-inspired rough polish | 2 | 2 | 2 | 2 | 2 | 3 | 5 | Uses customer accent and real catalog, but lacks phone shell, bottom raised create tab, exact hero/card rhythm, and Figma home information hierarchy. |
| `/customer/services` | `Customer / Services / Default` (`1:411`) | Figma-inspired route shell | 1 | 2 | 2 | 2 | 2 | 3 | 5 | No exported PNG yet; current implementation is catalog-driven list/search and not high-fidelity to services frame. |
| `/customer/order/create` | `Customer / CreateOrder / Default` (`1:594`) | Real API form with rough UI | 1 | 2 | 1 | 1 | 1 | 3 | 5 | Figma shows fixed bottom CTA, raised center nav, grouped address/problem/time cards, and media chips. Current page is generic cards/forms. |
| `/customer/orders` | `Customer / Orders / All` (`1:824`), `Orders / Empty` (`1:947`) | Real detail re-read plus not-wired order list | 1 | 2 | 2 | 2 | 2 | 3 | 5 | Current screen honestly preserves missing list API but does not match Figma order-card stack, progress labels, or empty-state composition. |
| `/customer/order-detail` equivalent | `Customer / OrderDetail / InProgress` (`1:1013`) | Not a dedicated route in 08e8355 | 0 | 0 | 0 | 0 | 0 | 1 | 4 | Figma has a dedicated in-progress detail screen. Current customer app only shows created order detail inside order/create success and orders re-read cards. |
| `/customer/profile` | `Customer / Mine / Default` (`1:1359`) | Not-wired profile shell | 1 | 2 | 2 | 2 | 2 | 3 | 5 | No exported PNG in this pass. Current page is honest but lacks Figma mine/settings hierarchy. |
| `/worker/` | `Worker / GrabHall / Online` (`1:1515`), `Paused` (`1:1647`) | Not-wired shell with light cards | 1 | 1 | 1 | 1 | 1 | 2 | 5 | Figma is dark blue immersive radar/voice-repair/nearby-order screen. Current staging is pale shell and does not carry the visual signature. |
| `/worker/tasks` | `Worker / Tasks / Accepted` (`1:2452`), `TaskDetail / InProgress` (`1:2543`) | Not-wired task shell | 1 | 1 | 1 | 1 | 1 | 2 | 5 | Business boundary is correct, but page does not mirror task card/detail flow. Missing PNG export for accepted/detail should be added before code repair. |
| `/worker/wallet` | `Worker / Income / Default` (`1:2742`) | Not-wired income shell | 1 | 1 | 1 | 1 | 1 | 2 | 5 | Current page avoids fake earnings, but does not match income visual system. Missing PNG export should be added before code repair. |
| `/worker/profile` | `Worker / Mine / Default` (`1:2811`) | Not-wired mine/certification shell | 1 | 1 | 1 | 1 | 1 | 2 | 5 | Current page is boundary-correct but lacks Figma mine layout. Missing PNG export should be added before code repair. |
| `/admin/` settlement console | `DESIGN_SOURCE_MISSING` for Settlement | Existing Settlement page wrapped in admin shell | 0 | 1 | 1 | 1 | 0 | 3 | 5 | Current Figma file has admin dashboard/work-order/dispatch/audit/complaint/after-sale/settings, but no Settlement console frame. Cannot claim high fidelity. |
| `/admin/#/settlement-ops/exports` | `DESIGN_SOURCE_MISSING` for Settlement exports | Existing export audit wrapped in admin shell | 0 | 1 | 1 | 1 | 0 | 3 | 5 | Needs either a dedicated Figma frame or explicit approval to adapt from admin table/card language. |
| `/admin/#/settlement-ops/statements/:id` | `DESIGN_SOURCE_MISSING` for Settlement detail | Existing detail wrapped in admin shell | 0 | 1 | 1 | 1 | 0 | 3 | 5 | No dedicated settlement statement detail frame exists in current Figma source. |
| `/admin/#/settlement-ops/governance` | `DESIGN_SOURCE_MISSING` for Governance | Existing governance read-only page refined | 0 | 1 | 1 | 1 | 0 | 3 | 5 | Governance page has no Figma frame. Current page is safety-correct, not Figma-high-fidelity. |
| future admin dashboard | `Admin / Dashboard / Default` (`1:2875`) | Not implemented as route | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Figma source exists but current admin app routes are Settlement/Governance only. Needs explicit product decision before replacing admin first screen. |
| future admin work-order pool | `Admin / WorkOrderPool / Default` (`1:2968`) | Not implemented | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Figma source exists; app route/API wiring not present in current 15.3C scope. |
| future admin dispatch | `Admin / Dispatch / Default` (`1:3326`) | Not implemented | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Figma source exists; must not be faked without backend/API plan. |
| future admin master audit | `Admin / MasterAudit / Default` (`1:3513`) | Not implemented | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Figma source exists; current Settlement/Governance audit pages are different product surfaces. |
| future admin complaint/after-sale | `Complaint` / `AfterSale` frames (`1:3649`, `1:3711`, `1:3736`) | Not implemented | 0 | 0 | 0 | 0 | 0 | 0 | 0 | Figma source exists; current app has no matching route in allowed business scope. |

## Root Causes Of The 08e8355 Visual Gap

1. 08e8355 used abstract optimized docs and tokens instead of pixel-reading the actual frame PNGs.
2. It did not rebuild the mobile phone shell: 390px canvas, thick rounded outer frame, fixed status area, fixed safe-area bottom navigation.
3. It did not reproduce role-specific flagship patterns:
   - customer: warm cream surface, raised middle create-order tab, fixed order CTA, grouped order cards.
   - worker: dark blue immersive radar, scanning rings, voice card, nearby order stack.
   - admin: dark purple mobile dashboard, metric tiles, bottom admin navigation.
4. It prioritized existing API safety and unit-test compatibility over visual fidelity.
5. Admin Settlement/Governance pages do not have matching Figma frames, but 08e8355 did not make that limitation visible enough.

## Design Source Missing

The following current routes must be marked `DESIGN_SOURCE_MISSING` until the Figma file includes matching frames or the user explicitly approves adapting from adjacent admin frames:

- Admin Settlement console.
- Admin Settlement export review.
- Admin Settlement statement detail.
- Admin Settlement governance.

These pages can be visually harmonized using admin dashboard/table/status rules, but they cannot be called high-fidelity Figma implementations.

## Pixel Repair Plan

### 1. Establish Visual Baseline

- Build a side-by-side screenshot board:
  - Figma PNG.
  - Current cloud-staging screenshot.
  - Delta notes.
- Start with:
  - `/customer/`
  - `/customer/order/create`
  - `/customer/orders`
  - `/worker/`
  - `/admin/`

### 2. Repair Shared Mobile Shell

- Add or revise `packages/ui` mobile shell variants in a code phase:
  - phone outer frame.
  - role-colored shell border.
  - fixed 390px design viewport.
  - Figma status/header zone.
  - bottom safe-area navigation.
  - raised center action tab for customer and worker where Figma requires it.
- Keep components business-neutral.

### 3. Customer Pixel Repair

- Rebuild customer order/create screen around Figma `1:594`:
  - grouped cards for service, contact/address, problem description, appointment/urgency/price.
  - fixed bottom submit CTA.
  - center raised `新报修` tab.
  - preserve real catalog/pricing/order/payment APIs.
- Rebuild orders screen from `1:824` and `1:1013`:
  - order card stack.
  - progress/detail composition.
  - no fake order list; use not-wired copy where the API is missing.

### 4. Worker Pixel Repair

- Rebuild `/worker/` from `1:1515` and `1:1647`:
  - dark blue background.
  - metric tiles.
  - scanning radar rings.
  - voice repair card.
  - nearby order card composition.
  - no fake task data; render not-wired/empty with Figma shape language.

### 5. Admin Pixel Repair

- Decision required:
  - Option A: implement actual Figma admin dashboard/work-order/dispatch/audit routes as new admin surfaces if business scope allows.
  - Option B: keep Settlement/Governance as current business routes and adapt only visual language from admin Figma frames; label as Figma-adapted, not high-fidelity.
- Do not claim Settlement/Governance high fidelity without dedicated Figma frames.

### 6. Verification Before Another Staging Upload

- Run normal build/typecheck/test.
- Capture Playwright screenshots for target routes.
- Compare each route against exported Figma PNG.
- Only then upload to cloud-staging for UAT.

## Recommendation

Do not proceed to more feature wiring until a dedicated Phase 15.3E or 15.4 visual repair code phase is approved.

Recommended next code phase:

`Phase 15.3E - Customer/Worker Pixel Repair Implementation`

Admin should wait for either dedicated Settlement/Governance Figma frames or explicit approval to adapt from the existing admin dashboard/work-order visual language.
