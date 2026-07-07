# Phase 15.3B Three-App Visual Productization Report

## Scope

Phase 15.3B applies the first Figma-based visual productization pass across customer, worker, and admin.

This pass does not change backend, database, deployment scripts, production configuration, or tags.

## Figma Frame Mapping

| App | Local routes / pages | Figma source | Implementation decision |
| --- | --- | --- | --- |
| customer | `/customer/` | `Customer / Home / Default` | Preserved real catalog/pricing/order state; already productized in the preceding customer pass. |
| customer | `/customer/services` | `Customer / Services / Default` | Preserved real catalog category/search composition; no static service SKU data. |
| customer | `/customer/order/create` | `Customer / CreateOrder / Default`, `Loading`, `Success`, `Error` | Preserved real quote, order create, payment order create, and detail verification states. |
| customer | `/customer/orders` | `Customer / Orders / All`, `Orders / Empty` | Preserved honest order-list not-wired state and real detail reread for locally created order ids. |
| customer | `/customer/profile` | `Customer / Mine / Default`, `Settings / Default` | Kept profile/account/address as not-wired; no local profile data. |
| worker | `/worker/` | `Worker / GrabHall / Online`, `Paused`, `Loading`, `Empty`, `Error` | Added productized empty/not-wired workbench with status tags, search shell, segmented filter, stats, and task card. |
| worker | `/worker/tasks` | `Worker / Tasks / Accepted`, `TaskDetail / InProgress` | Added task state shell only; no task records or fulfillment actions. |
| worker | `/worker/wallet` | `Worker / Income / Default` | Added metric shells and income empty state; no earnings, payout, or settlement data. |
| worker | `/worker/profile`, `/worker/certification` | `Worker / Mine / Default` | Added certification/service capability timeline; no identity or qualification status. |
| admin | `SettlementOpsPage` | `Admin / Dashboard / Default`, existing Settlement pages | Preserved read-only audit queries and added AdminShell/card/stat/table/status presentation. |
| admin | `SettlementStatementDetailPage` | Existing Settlement detail plus admin state rules | Preserved detail query and navigation; added card/table/timeline/status presentation. |
| admin | `SettlementExportReviewPage` | Existing export audit plus admin state rules | Preserved export audit query and detail navigation; added card/table/status presentation. |
| admin | `SettlementActionGovernancePage` | Governance-like admin audit/state rules | Preserved governance-only semantics and execution-disabled controls; added panel styling, UI buttons, and status tags. |

Dashboard and OA remain deferred because the Figma snapshot has no standalone product frames for them.

## UI Package Changes

- Added visual-only shell extension points:
  - `MobileShell.style`
  - `MobileShell.contentStyle`
  - `AdminShell.style`
  - `AdminShell.contentStyle`
  - `TopBar.subtitle`
  - `TopBar.style`
  - `BottomNav.style`
  - `SideNav.style`
- Updated `packages/ui/README.md` to document these boundaries.
- No business data, API calls, route assumptions, or sample records were added to `@xlb/ui`.

## Customer

Customer remains on the real Phase 15.3 API loop:

- `GET /api/catalog`
- `GET /api/pricing/quote?skuId=...`
- `POST /api/orders`
- `GET /api/orders/:orderId`
- `POST /api/payments/orders`

Not-wired items remain explicit:

- Customer order list API.
- Customer profile/account API.
- Customer address book API.
- Real external payment checkout/callback UI.

## Worker

Worker visual productization is intentionally not-wired:

- No task pool API is called.
- No accepted tasks are rendered.
- No income, payout, qualification, online eligibility, or service-city data is invented.
- Search and filters are disabled where no real API exists.

The UI now reflects the Figma grab hall / task / income / mine hierarchy while staying honest about missing wiring.

## Admin

Admin productization preserves existing Settlement and Governance logic:

- Existing same-origin `API_BASE` behavior is unchanged.
- Settlement audit, summary, gap scan, detail, export review, and governance dry-run APIs are not rewritten.
- AdminShell, card, status tag, table, loading, empty, and error presentation now align with the optimized admin rules.
- Execution-disabled governance controls remain disabled.

## Safety

- No Figma PNG is used as a page background.
- No backend, db, deploy, infra, dashboard, or oa files are modified.
- No production configuration is touched.
- No tag is created.
- API requests remain same-origin; `/api/api` is not introduced.

## Verification

- `pnpm --filter @xlb/ui typecheck`: PASS.
- `pnpm --filter @xlb/ui build`: PASS.
- `pnpm --filter @xlb/customer typecheck`: PASS.
- `pnpm --filter @xlb/customer build`: PASS.
- `pnpm --filter @xlb/worker typecheck`: PASS.
- `pnpm --filter @xlb/worker build`: PASS.
- `pnpm --filter @xlb/admin typecheck`: PASS.
- `pnpm --filter @xlb/admin build`: PASS.
- `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
- `rg -n "Phase 0 Ready" apps/customer apps/worker apps/admin`: PASS, no matches.
- `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client`: PASS, no matches.
- `rg -n "mock|fake|dummy" apps/customer apps/worker apps/admin packages/api-client`: reviewed. Matches are limited to the existing api-client local payment webhook helper and are not used by customer/worker/admin pages to fabricate business records.
