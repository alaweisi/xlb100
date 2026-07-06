# Phase 15.3 Customer Minimal Real Business Loop Report

Date: 2026-07-06

## Scope

Phase 15.3 wires the customer app to the existing same-origin backend APIs for the smallest real customer business loop. It does not deploy cloud-staging, touch production, create tags, or modify worker/admin/dashboard/OA apps.

Modified scope:

- `apps/customer/src/app/App.tsx`
- `packages/api-client/src/customer.ts`
- `docs/execution/PHASE15_PROGRESS.md`
- `docs/reports/PHASE15_3_CUSTOMER_LOOP_REPORT.md`

Backend business logic was not modified.

## API Audit

Existing backend APIs that can be used by the customer app:

| Area | API | Source | Phase 15.3 status |
| --- | --- | --- | --- |
| Catalog | `GET /api/catalog` | `backend/src/catalog/catalogModule.ts` | Wired |
| Pricing | `GET /api/pricing/quote?skuId=...` | `backend/src/pricing/pricingModule.ts` | Wired |
| Order create | `POST /api/orders` | `backend/src/order/orderRoutes.ts` | Wired |
| Order detail | `GET /api/orders/:orderId` | `backend/src/order/orderRoutes.ts` | Wired |
| Payment order | `POST /api/payments/orders` | `backend/src/payment/paymentWebhook.ts` | Wired after order creation |
| Payment callback | `POST /api/payments/mock-webhook` | `backend/src/payment/paymentWebhook.ts` | Not wired in customer UI |

Request context:

- The customer app sends same-origin API requests with `baseUrl: ""`.
- Customer headers use `XLB_HEADERS.appType`, `XLB_HEADERS.role`, `XLB_HEADERS.cityCode`, and `XLB_HEADERS.userId`.
- The local customer identity remains `customer-demo-001` because no real customer profile/account API exists yet. This identity is used only to satisfy the existing order API contract.

## Not-Wired List

The following areas are intentionally not wired because no suitable customer-facing API was found:

- Customer order list API such as `GET /api/orders?customerId=...`.
- Customer profile/account API.
- Customer address book API.
- Real customer payment provider checkout and callback flow.
- Customer authentication/session API.

The customer orders page does not fabricate an order list. It only re-reads real order IDs created in the current browser via `GET /api/orders/:orderId`.

## Page Completion

| Page | Route | Result |
| --- | --- | --- |
| Customer home | `/customer/` | Loads real catalog data, supports city selection and catalog search, links real SKUs into order creation. |
| Services | `/customer/services` | Loads real catalog categories/SKUs, supports search and category tabs, does not hardcode service data. |
| Create order | `/customer/order/create` | Loads real catalog, reads real price quote, submits `POST /api/orders`, creates a real payment order, and verifies order detail. |
| Orders | `/customer/orders` | Shows not-wired state for missing list API and re-reads locally remembered real order IDs via order detail API. |
| Profile | `/customer/profile` | Shows account shell with explicit not-wired state for missing profile/address APIs. |

## Figma And Render Strategy Usage

- The customer app keeps the Phase 15.2 mobile-first route shell and centered max-width web container.
- Shared `@xlb/ui` components are used for `MobileShell`, `TopBar`, `BottomNav`, `SearchBar`, `ServiceCard`, `OrderCard`, `Card`, `Button`, `EmptyState`, `LoadingState`, `ErrorState`, `Skeleton`, `Tabs`, `FormField`, `Input`, `Select`, and `Badge`.
- Loading, empty, error, retry, and success states are rendered explicitly.
- No Figma PNG is used as a fixed page background.
- No fake services, fake orders, or fake success states are introduced.

## Package Changes

`packages/api-client/src/customer.ts` now exposes customer helpers for:

- `getCatalog`
- `getPriceQuote`
- `createOrder`
- `getOrder`
- `createPaymentOrder`
- existing `mockPaySuccess` remains for the backend local payment webhook but is not used by the customer app.

`packages/types` was not modified.

## Real Local Order Creation

The implemented `/customer/order/create` flow can create a real local DB order when submitted in the browser. During automated verification for this commit, no extra browser-driven customer order was submitted. Existing root integration tests continue to exercise real local `POST /api/orders` and payment order flows against the local test database.

## Verification

Completed before commit:

- `pnpm --filter @xlb/customer typecheck`: PASS.
- `pnpm --filter @xlb/customer build`: PASS.
- `pnpm --filter @xlb/api-client typecheck`: PASS.
- `pnpm --filter @xlb/types typecheck`: PASS.
- `pnpm test -- --bail=1`: PASS, 255 test files passed, 1048 tests passed, 1 todo.
- `rg -n "Phase 0 Ready" apps/customer`: PASS, no matches.
- `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer packages/api-client`: PASS, no matches.
- `rg -n "mock|fake|dummy" apps/customer packages/api-client`: reviewed. Matches are limited to the existing `packages/api-client/src/customer.ts` payment webhook helper (`mockPaySuccess`, `/api/payments/mock-webhook`, and `PaymentProvider = "mock"`). The customer page does not call this helper and does not use fake business data.

## Phase 15.4 Recommendation

Phase 15.4 is recommended only after Phase 15.3 passes the full root test/security gate and after the user confirms the worker business loop priority. Customer gaps that should stay visible before expanding scope:

- Customer order list API.
- Customer profile/account API.
- Address book API.
- Real payment provider UX and callback flow.
