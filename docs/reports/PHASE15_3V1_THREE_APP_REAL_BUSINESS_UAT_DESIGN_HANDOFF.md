# Phase 15.3V-1 Three-App Real Business UAT Design Handoff

Status date: 2026-07-08

This handoff is for the next build tranche: **C/W/A are all in real backend UAT mode**; no fabrication of business facts.

## 0) Scope confirmation for this round

- No new backend, db, deploy, infra changes.
- No production rollout.
- No fake/mock/dummy service/order/price/payment/dispatch data.
- No static non-interactive demo shells for W/A; use real API-driven states where interface support exists.
- SwiftUI `glassEffect` is explicitly **not** used in this round. Liquid glass here means **web CSS style** (backdrop-filter + glass surface tokens).

## 1) End-state target: `THREE_APP_REAL_BUSINESS_UAT_DESIGN_READY`

### C端（Customer）

- Must implement full real chain:
  - `/customer/` → `/customer/services` → `/customer/order/create`
  - pricing → order → payment order → order detail
- API-driven from: catalog / pricing / orders / payments / workflow binding.

### W端（Worker）

- Task Hall (`/worker/`) as real task/fulfillment entry if endpoint exists.
- Task list and task detail actions from real workflow endpoints where contract exists.
- If any endpoint is missing, mark `CONTRACT_MISSING` and keep non-fabricated empty/guardrail UI.

### A端（Admin）

- Settlement + governance slices from real internal/admin APIs with execution disabled and governance-only controls.
- Keep execution disabled for all payout/refund/reversal/payment/settlement mutation steps.
- No visual redesign-only mode; no fake operational status.

## 2) Canonical contract baseline used

- Customer contracts: `CONTRACT_CATALOG`, `CONTRACT_PRICING`, `CONTRACT_ORDER`, `CONTRACT_PAYMENT`, `CONTRACT_REQUEST_CONTEXT`, `CONTRACT_WORKFLOW_UI_BINDING`.
- Worker contracts: `CONTRACT_WORKER_TASK_POOL`, `CONTRACT_WORKER_ACCEPT`, `CONTRACT_FULFILLMENT_SKELETON`, `CONTRACT_FULFILLMENT_LIFECYCLE`, `CONTRACT_WORKER_PROFILE`, `CONTRACT_WORKER_ELIGIBILITY`, `CONTRACT_WORKER_QUALIFICATION`, `CONTRACT_WORKER_CERTIFICATION`.
- Admin contracts: `CONTRACT_SETTLEMENT_BATCH`, `CONTRACT_SETTLEMENT_PAYABLE_READINESS`, `CONTRACT_SETTLEMENT_PAYABLE_QUEUE`, `CONTRACT_SETTLEMENT_PREPARATION`, `CONTRACT_SETTLEMENT_CONFIRMATION`, `CONTRACT_SETTLEMENT_ACTION_INTENT`, `CONTRACT_WORKFLOW_UI_BINDING`.

> Missing backend contract coverage (explicitly allowed) = `CONTRACT_MISSING`.

## 3) Web liquid-glass design system direction (mandatory for this pass)

### Visual tokens (role-level)

- `backdrop-filter: blur(18px) saturate(115%)` for cards and shell surfaces.
- glass surfaces with:
  - semi-transparent `rgba(...)` background (`alpha 0.10–0.25`)
  - thin border (`1–2px`) using `rgba(255,255,255,0.22)`
  - soft shadows (`0 16px 34px rgba(0,0,0,0.15)`)
  - radius `22–34px` for major cards, `14–20px` for cards.
- Mobile-first with safe area handling (`env(safe-area-inset-*)` padding).
- Keep strong hierarchy; avoid default cards and dense blocks.
- Keep bottom `ActionDock` for key operations and progress states.

## 4) Route-by-route architecture handoff

### 4.1 Customer route matrix

| Route | Backend contract/source | UI composition rule | Required runtime behavior |
|---|---|---|---|
| `/customer/` | `GET /api/catalog`; request headers `x-xlb-app-type/customer`, `x-xlb-role/customer`, `x-xlb-city-code` | `CustomerHomeTemplate` + `LocationSearchBar` + cards from real catalog | one integrated search pill; no standalone city card; city and query must influence downstream `services` route context |
| `/customer/services` | `GET /api/catalog` + local query filtering | `CustomerServicesTemplate` + ServiceDiscovery list cards | query from URL `q` and `selectedCityCode` must drive result count & empty-state only; no fake recommendations |
| `/customer/order/create` | `GET /api/pricing/quote?skuId`, `POST /api/orders`, `POST /api/payments/orders`, `GET /api/orders/:orderId` | `CustomerOrderCreateTemplate` + `ServiceSelectionSummary` + `QuantityStepper` + `CustomerQuoteCard` | selected SKU defaults to source card; no duplicate title fragments; quantity min 1; create + payment + detail follow API success/error exactly |

### 4.2 Worker route matrix

| Route | Backend contract/source | UI composition rule | Required runtime behavior |
|---|---|---|---|
| `/worker/` | `GET /api/worker/task-pool`, `POST /api/worker/tasks/:dispatchTaskId/accept` | Worker shell + task list surface + action dock | show task list from backend when available; no mocked queued tasks; actions and disabled reasons from binding |
| `/worker/tasks` | `GET /api/worker/fulfillments`, `POST /api/worker/fulfillments/:fulfillmentId/start`, `POST /api/worker/fulfillments/:fulfillmentId/complete`, `GET /api/worker/fulfillments/:fulfillmentId` | Task detail/acceptance and execution surface | state transitions and buttons from API status; if endpoint unavailable, render guardrail + empty/read-only state |
| `/worker/wallet` | `CONTRACT_MISSING` in current source (no explicit worker wallet API contract) | Read-only wallet shell + action panel | do not fabricate incomes/balance; show guardrail and route capabilities only |
| `/worker/profile` | `CONTRACT_WORKER_PROFILE` | Profile + certification links with backend data only | no fake certifications/online status |
| `/worker/certification` | `CONTRACT_WORKER_CERTIFICATION` | Real certification card shell + submit flow | only show real submit/approval status from API; no fake success |

### 4.3 Admin route matrix

| Route | Backend contract/source | UI composition rule | Required runtime behavior |
|---|---|---|---|
| `/admin/` settlement shell | `CONTRACT_SETTLEMENT_BATCH`, `/api/internal/settlement/batches` | Shell + ops cards + audit table + metric cards | real list/detail from backend; no generated figures |
| `/admin/settlement-ops/statements/:id` | `CONTRACT_SETTLEMENT_BATCH` + `/api/internal/settlement/batches/:batchId/items` + `/api/internal/settlement/worker-statement-audit` | detail + timeline + outbox trace cards | read backend state + outbox idempotency; no mutation |
| `/admin/settlement-ops/exports` | settlement export audit endpoints in current admin implementation | backend export/audit list surface | no fake export rows |
| `/admin/settlement-ops/governance` | `CONTRACT_SETTLEMENT_ACTION_INTENT` + governance APIs | governance-only action cards + disabled execution controls | enforce no payout/refund/reversal/execute flows |

## 5) UAT field visibility policy

- User-visible area: business readable text only (prices, title, count, status, action CTA as permitted).
- Technical/engineering fields (`searchMode`, `catalog source endpoint`, `workflowState`, `disabledReason`, `availableActions`, `createOrderPayload` raw payloads, etc.) belong to **UAT panel only**.
- UAT panel can expose raw payloads and `CONTRACT_MISSING` labels for audit and handoff.

## 6) Three-app CONTRACT_MISSING list

| ID | Field/API gap | Impact | Required UAT output |
|---|---|---|---|
| CMISSING-01 | `/api/catalog/search` | client-side filtering required in Customer services search | UAT panel must show `searchMode=client-filter` |
| CMISSING-02 | `estimated_price/inspection_fee/final_price` in pricing | pricing UI can only show available quote fields | UAT marks these as backend-absent |
| CMISSING-03 | admin full contract docs for settlement/governance audit/review/export API families | execution-only governance surfaces cannot claim exact contract parity | UAT marks as `DESIGN_SOURCE_MISSING + CONTRACT_MISSING` while still rendering real fetched data |
| WMISSING-01 | worker task-pool endpoint typed helper gap in current API client surface | runtime call integration risk | UAT notes typed client helper gap and validates through adapter output only |
| WMISSING-02 | worker wallet/income contract | no wallet real data in this phase | task shows guardrail + empty state |
| AMISSING-01 | admin Dashboard direct route Figma/design source for several ops pages | cannot claim pixel-perfect completeness | mark route as derived/design-source-missing |

## 7) UAT review runbook (design-ready)

### 7.1 Customer

1. Open `/customer/`; verify integrated city/search pill.
2. Open `/customer/services?q=...`; verify filtering by city and q, and empty-state count.
3. Select one SKU and enter `/customer/order/create`; verify selected summary fields.
4. Verify quantity floor = 1 and no decrement-to-zero.
5. Verify quote + order + payment order + order detail are all API-sourced.
6. Open UAT panel and confirm required fields + contract missing marks.

### 7.2 Worker

1. Open `/worker/`; verify task list rendering from backend when task pool endpoint returns data.
2. Open `/worker/tasks/:id`; verify task transitions from list/read/detail by endpoint status.
3. Verify accept/start/complete calls only when backend endpoint action contract allows.
4. Verify wallet/profile/certification surfaces do not fabricate data.

### 7.3 Admin

1. Open settlement ops and verify statement/batch list and summary cards are API-backed.
2. Open one statement detail and verify outbox/review/export references are from backend.
3. Open governance page and verify controls are governance-only; execution is explicitly disabled.

## 8) Implementation handoff notes for Spark/Codex

- Keep route-level behavior to five-layer architecture: tokens → primitives → patterns → templates → app/adapters.
- UAT panel and debug copy can reference engineering fields; user-facing copy must stay business-readable.
- No business status copy should include `contract`, `api`, `mock`, `fake`, `dummy` fields.
- Avoid inline business branching in primitives/patterns; keep all logic in app/adapters.
- Any missing API implementation item found during implementation must append/refresh this handoff's `CONTRACT_MISSING` row and keep implementation documents in sync.
