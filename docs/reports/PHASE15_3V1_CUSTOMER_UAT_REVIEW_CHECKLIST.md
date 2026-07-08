# Phase 15.3V-1 Customer UAT Review Checklist

Version: 2026-07-08
Source: `PHASE15_3V1_CUSTOMER_BACKEND_UI_CONTRACT_MAP.md`, `PHASE15_3V1_CUSTOMER_UAT_FIELD_TRACEABILITY.md`
Scope: Docs-only, for contractor handoff + staging UAT execution.

## 1) Global pre-check (before any UI construction validation)

| Check ID | Check item | Method | Expected | Evidence target | Contract state | Pass rule |
|---|---|---|---|---|---|---|
| PRE-01 | Confirm traceability artifacts exist | Read files in repo | Both docs files exist and define field-to-contract mapping | `docs/reports/PHASE15_3V1_CUSTOMER_BACKEND_UI_CONTRACT_MAP.md`, `docs/reports/PHASE15_3V1_CUSTOMER_UAT_FIELD_TRACEABILITY.md` | CONTRACT_COMPLETE | PASS |
| PRE-02 | Confirm UAT-only markers are not used in user-visible copy | UI copy review on `/customer/`, `/customer/services`, `/customer/order/create` | `CONTRACT_MISSING`, `searchMode`, `workflowState`, `availableActions`, `disabledReason` should only appear in UAT panel or engineering docs | UAT panel JSON/文本 dump + screenshot of user-facing headers/cards | POLICY_CHECK | PASS |
| PRE-03 | Confirm header/state context | Contract requires city header context in every backend request | `x-xlb-city-code` present in request flow and reflected as `city_code` in UAT | Network trace and UAT field snapshot | TRACEABLE | PASS |

## 2) `/customer/` UAT review checklist

| Step | UAT Field | Input/Action | Expected behavior in UI | Data source | Acceptance check | Fail if |
|---|---|---|---|---|---|---|
| C-01 | `city_code` | Open `/customer/` with chosen city | UAT panel shows current selected city code; no hardcoded fake city/geo claim | Request context header | Header `x-xlb-city-code` and UI state consistent with selected city | City code missing or inconsistent
| C-02 | `search query` | Type placeholder text flow in top bar | Search box works but no fabricated service list is added | Client state from services route input and query binding | Query text captured in URL transition and state | Search input not bound to next-step filtering
| C-03 | `catalog source endpoint` | Enter page load | Page loads catalog through `/api/catalog`; if unavailable, UAT panel notes catalog source as API | `GET /api/catalog` | No mock seed list used for initial cards | Any hardcoded/mock services on home
| C-04 | `workflow state` | Enter page, observe action/flow state panel | UAT panel can display workflow state if adapter provides; user UI keeps business-agnostic labels | `createCustomerWorkflowBinding().state` + route adapter | Stable state label and no fabricated states | Missing while adapter returns state or fabricated states
| C-05 | `availableActions` | Check action affordances under flow header/panel | Available actions shown only for QA panel and mapped to binding | `createCustomerWorkflowBinding().availableActions` | UAT list contains action IDs and enabled/disabled flags | Action list hardcoded without backend source

## 3) `/customer/services` UAT review checklist

| Step | UAT Field | Input/Action | Expected behavior in UI | Data source | Acceptance check | Fail if |
|---|---|---|---|---|---|---|
| S-01 | `searchQuery` | Visit `/customer/services?q=疏通` and change q | Page enters filtered mode based on URL query and selected city | URL query + local catalog filter | `searchQuery` equals URL-decoded `q` and updates with city| Search does not follow URL query
| S-02 | `searchMode` | Compare mode in UAT panel | `searchMode = client-filter` when `/api/catalog/search` is not available | `CONTRACT_MISSING` contract annotation | `searchMode` explicitly records fallback mode | Any claim of backend search support
| S-03 | `matchedSkuCount` | Load a query expected to narrow results | Count equals filtered SKU list length from `getCatalogSkus()` output | `GET /api/catalog` + local memoized filter | `matchedSkuCount` = array length used to render service cards | Count mismatch with rendered cards
| S-04 | `selectedSkuId` / `selectedSkuName` | Tap a service card | Selected item passed into create route context | Catalog-derived view model | ID/Name captured exactly from selected record | Wrong mapping, duplicate path in title | 
| S-05 | `catalog category count` (implementation field) | Render service list | Category filtering and service results remain real catalog derived | `getCatalogSkus()` and local filter state | Category count and list correspond to catalog payload | Fake category count or hardcoded list
| S-06 | `workflow state / availableActions` | Open action panel | Only bound workflow action data appears in UAT; no fake button logic in business state | workflow binding adapter | UAT panel shows state/action from binding layer | Hardcoded action labels for states not in binding

## 4) `/customer/order/create` UAT review checklist

| Step | UAT Field | Input/Action | Expected behavior in UI | Data source | Acceptance check | Fail if |
|---|---|---|---|---|---|---|
| OC-01 | `selectedSkuId` / `selectedSkuName` | Enter from services with selected sku | Service summary defaults to exactly one selected SKU; no duplicate service-title display | Catalog item payload | Summary main title and subtitle align to sku/service + category path + unit | Duplicate or merged names like “X / X / X” remain
| OC-02 | `quote` | Trigger quote fetch for selected sku | Quote panel shows `basePrice`, `priceText`, `priceType`, `currency` | `GET /api/pricing/quote?skuId` -> `PriceQuoteResponse` | Fields match live response, fallback only when API unavailable | Any fabricated `estimated_price`/`inspection_fee`/`final_price`
| OC-03 | `createOrderPayload` | Change quantity and confirm payload | Payload includes `skuId`, `quantity` and route context city; no `cityCode` field in body | create order request | Recorded payload or adapter trace for request body and headers | City code incorrectly placed in payload body
| OC-04 | `orderId` | Submit order | On success UAT shows returned `orderId` and links to detail verify path | `POST /api/orders` response + `GET /api/orders/:orderId` | `orderId` exists, non-empty, deterministic | Missing orderId or fabricated values
| OC-05 | `paymentOrderId` | Trigger payment order step | Payment order ID and status shown when API returns `paymentOrder` | `POST /api/payments/orders` response | Non-empty id + status shown | Missing id/status or mocked mock-webhook behavior
| OC-06 | `orderDetail` | Open detail readback after order create | Detail fields reflect created order content; status and amount coherent | `GET /api/orders/:orderId` | Detail object consistent with create response | Mismatch between created order and detail fetch
| OC-07 | `workflowState` / `availableActions` / `disabledReason` | Inspect UAT section only | Show values from workflow binding, never from fabricated front-end constants | `createCustomerWorkflowBinding()` | UAT matches adapter-generated values | UAT fields missing or hardcoded strings
| OC-08 | `payment status` gap handling (`CONTRACT_MISSING-04`) | Attempt payment completion flow | UAT panel explains no production-ready callback state; avoids claiming real completion | `CONTRACT_MISSING` (mock webhook only for dev) | Explicit missing-note present; no simulated success claims | Fake “payment success” without actual callback contract

## 5) CONTRACT_MISSING gap enforcement checks

| Gap ID | Required UAT statement | Mandatory evidence action | Verification command/inspect | Pass rule |
|---|---|---|---|---|
| CONTRACT_MISSING-01 | Catalog search API missing | UAT shows `searchMode=client-filter` and local filter scope | Enter `/customer/services?q=xxx` and confirm count matches rendered list | Manual UI + console/state check | Always PASS if clear evidence label exists and behavior matches |
| CONTRACT_MISSING-02 | pricing split fields missing | UAT does not display `estimated_price/inspection_fee/final_price` as real values | Field audit in pricing card and UAT panel JSON | Manual field audit | PASS only if these fields are marked N/A / not shown |
| CONTRACT_MISSING-03 | workflow fields missing in REST | `workflowState/availableActions/disabledReason` marked as adapter-bound | Review workflow binding source path in docs + runtime panel | Adapter trace audit | PASS when source notes mention binding, not REST field |
| CONTRACT_MISSING-04 | payment completion status stream missing | UAT panel only shows `paymentOrderId` and response status, no claim of final settlement flow | Inspect post-payment area and logs | Runtime UI + network log | PASS only when no “mocked paid final” wording in user area |
| CONTRACT_MISSING-05 | real order list contract scoped out for now | `/customer/orders` list remains explicit out-of-scope or limited | Page behavior and docs consistency check | Manual route check | PASS when list is not claimed as full source of truth |

## 6) Staging UAT runbook (execution order)

1. Open `/customer/` with each allowed city; validate `city_code` + search entry + no duplicated home city card and no fake service recommendations.
2. Navigate `/customer/services?q=疏通`; validate `searchQuery`, `searchMode`, `matchedSkuCount`, and card rendering count.
3. Select one SKU and continue to `/customer/order/create`; validate default selection, deduplicated service labels, and quantity floor behavior.
4. Fetch quote and validate `quote` fields, no fabricated decomposition pricing.
5. Create order and verify `createOrderPayload` field composition (`cityCode` in context only), `orderId`, `orderDetail` refresh.
6. Create payment order and validate `paymentOrderId` + payment order response fields.
7. Open UAT panel and validate `workflowState`, `availableActions`, `disabledReason` with explicit `CONTRACT_MISSING` coverage.
8. Save checklist with screenshots and payload diffs for each step.

Acceptance criterion for this phase:
- All rows in this checklist are PASS.
- Every `CONTRACT_MISSING` row is explicitly documented in UAT panel or report notes and is not disguised as implemented capability.
