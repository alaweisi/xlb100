# Phase 15.3E-VERIFY - Workflow Figma UI Architecture Gate Report

## Executive Summary

Gate result: `PARTIAL GO`.

Phase 15.3E-ARCH is sufficient to let Customer and Worker enter a constrained Phase 15.3F Pixel Repair Implementation, provided each route first materializes the documented `WorkflowUiBinding` / `ActionContract` view model and does not add business behavior.

Admin Settlement / Governance / Export Review / Statement Detail / Governance hash routes must remain paused for high-fidelity pixel repair because the current Figma source has no dedicated Settlement or Governance frames. They may only receive non-business visual harmonization from derived admin shell/table/state rules after a separate route action-contract pass.

No app code, package code, backend, db, deploy, infra, production environment, or tag changes are authorized by this verification.

## Inputs Read

- `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
- `docs/contracts/CONTRACT_RUNTIME_THEMING_TOKENS.md`
- `docs/design/ui/PHASE15_WORKFLOW_DRIVEN_UI_DESIGN_MASTER_PLAN.md`
- `docs/reports/PHASE15_3E_WORKFLOW_FIGMA_THEMING_ARCH_REPORT.md`
- `docs/design/figma/**`
- `docs/design/figma/optimized/**`
- `docs/design/figma/frames/**`
- `docs/design/figma/assets/**`
- `docs/prompts/CODEX_PHASE15_UI_VISUAL_REFINEMENT_SKILL.md`
- `.cursor/rules/phase15-ui-visual-system.mdc`

Additional read-only evidence used for source validation:

- Relevant backend contract docs under `docs/contracts/`
- Current app action call sites under `apps/customer`, `apps/worker`, and `apps/admin`
- Current API client method maps under `packages/api-client/src`

## Context Note

`docs/CURRENT_STATE.md` still reports Phase 14 as in progress, while recent commits and `docs/execution/PHASE15_PROGRESS.md` record Phase 15.3E-ARCH. This report treats the requested Phase 15.3E-VERIFY scope and the actual Phase 15 documents on disk as the task source, and does not modify `CURRENT_STATE`.

## 1. Route Workflow Binding Matrix

Legend:

- `exact`: direct route frame exists and may be used as a Phase 15.3F repair target; it is not a high-fidelity claim until screenshot comparison passes.
- `partial`: related route/state frame exists but coverage is incomplete.
- `derived`: visual language exists but no direct route frame.
- `DESIGN_SOURCE_MISSING`: no matching Figma route frame exists.

| route | actor | workflowName | backendSource | workflowStates | availableActionsSource | disabledReasonSource | uiSlots | packagesUiComponents | figmaBinding | runtimeThemeTokens | readiness |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `/customer/` | customer | `customer.catalog.browsing` | `CONTRACT_CATALOG.md`; `GET /api/catalog`; `packages/api-client/src/customer.ts#getCatalog` | catalog loading / empty / error / populated from API response | navigation actions only; service entry derives target SKU from backend catalog item; no local business mutation | API error, empty catalog, `API_NOT_AVAILABLE` if catalog fails | `pageHero`, `summaryCard`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `MobileShell`, `TopBar`, `HeroCard`, `SearchBar`, `ServiceCard`, `Button`, `BottomNav`, `LoadingState`, `ErrorState`, `EmptyState` | `partial`: `Customer / Home / Default`, node `1:228`, PNG exists | customer role accent `#B85F2A`, cream `#FFFAF0`, coffee `#2B2118`, radius 16/24/28, 8pt spacing; visual-only | READY |
| `/customer/services` | customer | `customer.catalog.browsing` | `CONTRACT_CATALOG.md`; `GET /api/catalog`; `pages.json` frame `Customer / Services / Default` | catalog search/filter display derived from API catalog response | service selection/navigation derived from catalog SKU ids; no executable business mutation | API error / empty / no selected SKU maps to disabled or unavailable UI | `summaryCard`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `MobileShell`, `TopBar`, `SearchBar`, `Tabs` or `SegmentedControl`, `ServiceCard`, `Button`, `BottomNav`, `LoadingState`, `ErrorState`, `EmptyState` | `partial`: `Customer / Services / Default`, node `1:411`, inventory exists, no local PNG | same customer role tokens; no page-level festival/campaign hardcode | READY |
| `/customer/order/create` | customer | `customer.order.create`; `customer.pricing.quote`; `customer.paymentOrder.create` | `CONTRACT_PRICING.md`; `GET /api/pricing/quote?skuId`; `CONTRACT_ORDER.md`; `POST /api/orders`; `GET /api/orders/:orderId`; `CONTRACT_PAYMENT.md`; `POST /api/payments/orders` | quote loading/error/success; order `draft -> pending_payment`; payment order `pending`; verified order readback | backend endpoints plus quote/order/payment state; Phase 15.3F must wrap submit/retry/view actions in `ActionContract` and avoid mock webhook UI | `STATE_NOT_ACTIONABLE`, `API_NOT_AVAILABLE`, `CITY_SCOPE_REQUIRED`, backend error text; no payment-success claim without backend | `summaryCard`, `primaryActionDock`, `workflowTimeline`, `stateBadge`, `apiError`, `guardrail`, `themeSurface` | `CustomerQuoteCard`, `PriceText`, `ActionDock`, `WorkflowTimeline`, `OrderCard`, `Button`, `StatusTag`, `ApiErrorPanel`, `LoadingState` | `exact`: `Customer / CreateOrder / Default`, node `1:594`, PNG exists; loading/success/error frames also exist | customer tokens plus button/card/status component tokens; visual-only | READY |
| `/customer/orders` | customer | `customer.order.list.notWired`; `customer.order.detail` | `CONTRACT_ORDER.md`; `GET /api/orders/:orderId`; list API not wired by contract | locally remembered IDs may be re-read through backend detail; list absence is explicit not-wired state | retry/detail navigation from backend detail reads; no fake list; cancellation frames exist but no enabled cancellation action unless backend contract is added | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `STATE_NOT_ACTIONABLE` | `workflowTimeline`, `stateBadge`, `notWired`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `OrderCard`, `WorkflowTimeline`, `StatusTag`, `NotWiredState`, `EmptyState`, `ApiErrorPanel`, `Button`, `BottomNav` | `partial`: `Customer / Orders / All`, `Orders / Empty`, `OrderDetail / InProgress`, nodes `1:824`, `1:947`, `1:1013`; PNGs for All and Detail | customer tokens; status tones must map to backend order status only | READY |
| `/customer/profile` | customer | `customer.profile.notWired` | no profile/account/address backend contract wired for C app | not-wired/read-only shell only | no functional account/address/security buttons until backend APIs exist | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `IDENTITY_REQUIRED` | `notWired`, `summaryCard`, `bottomNav`, `themeSurface` | `MobileShell`, `TopBar`, `Card`, `NotWiredState`, `StatusTag`, `BottomNav` | `partial`: `Customer / Mine / Default`, `Settings / Default`, nodes `1:1359`, `1:1440`, inventory exists, no local PNG | customer tokens; profile visuals must not imply real account state | READY |
| `/worker/` | worker | `worker.taskPool.notWired`; future `worker.taskPool.read`; `worker.acceptOrder.unavailable` | `CONTRACT_WORKER_TASK_POOL.md`; `GET /api/worker/task-pool`; `CONTRACT_WORKER_ACCEPT.md`; `POST /api/worker/tasks/:dispatchTaskId/accept` only after task/eligibility state exists | current UI is not-wired/empty; future state from queued task pool, eligibility, worker city binding | current accept button disabled; future accept action must come from task pool row + eligibility + accept contract + idempotency | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `CITY_SCOPE_REQUIRED`, `PERMISSION_DENIED`, `STATE_NOT_ACTIONABLE` | `pageHero`, `summaryCard`, `stateBadge`, `guardrail`, `notWired`, `emptyState`, `bottomNav`, `themeSurface` | `WorkerStatusCard`, `WorkOrderCard`, `MetricCard`, `GuardrailCard`, `NotWiredState`, `Button`, `StatusTag`, `Tabs`, `SearchBar`, `BottomNav` | `exact`: `Worker / GrabHall / Online`, node `1:1515`, PNG exists; `Paused`, `Loading`, `Empty`, `Error` states exist | worker role accent `#08172B`, role surface tokens, safe-area bottom, fixed card dimensions; visual-only | READY |
| `/worker/tasks` | worker | `worker.fulfillment.tasks.notWired`; future `worker.fulfillment.lifecycle` | `CONTRACT_FULFILLMENT_LIFECYCLE.md`; `GET /api/worker/fulfillments`; `POST /api/worker/fulfillments/:id/start`; `POST /api/worker/fulfillments/:id/complete` in API client | current not-wired; future accepted / in_progress / completed from backend fulfillment status | current no lifecycle actions; future start/complete must use backend status, worker ownership, idempotency, city scope | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `STATE_NOT_ACTIONABLE`, `CITY_SCOPE_REQUIRED` | `workflowTimeline`, `stateBadge`, `guardrail`, `notWired`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `WorkerTaskCard`, `WorkOrderCard`, `WorkflowTimeline`, `GuardrailCard`, `NotWiredState`, `Button`, `StatusTag`, `BottomSheet` | `partial`: `Worker / Tasks / Accepted`, `TaskDetail / InProgress`, nodes `1:2452`, `1:2543`, inventory exists | worker tokens; no fake task color/status driven by theme | READY |
| `/worker/wallet` | worker | `worker.wallet.notWired` | no wallet/income API contract wired for W app; settlement docs are internal/admin audit only | not-wired/read-only; no income, payout, withdrawal, or settlement success state | no executable wallet actions; all payout/withdrawal affordances disabled or absent | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `PHASE_BOUNDARY` | `summaryCard`, `notWired`, `guardrail`, `bottomNav`, `themeSurface` | `MetricCard`, `Card`, `Timeline`, `NotWiredState`, `StatusTag`, `BottomNav` | `partial`: `Worker / Income / Default`, node `1:2742`, inventory exists | worker tokens; visual-only; must not imply payable/withdrawal status | READY |
| `/worker/profile` | worker | `worker.profile.read.notWired`; `worker.certification.status.notWired` | `CONTRACT_WORKER_PROFILE.md`; `CONTRACT_WORKER_CERTIFICATION.md`; `CONTRACT_WORKER_QUALIFICATION.md`; `CONTRACT_WORKER_ELIGIBILITY.md` | current not-wired; future profile status, certification status, qualification, city binding from backend | no executable certification/profile mutation unless backend endpoint and status action are wired | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `IDENTITY_REQUIRED`, `PERMISSION_DENIED` | `summaryCard`, `stateBadge`, `guardrail`, `notWired`, `bottomNav`, `themeSurface` | `Card`, `Timeline`, `NotWiredState`, `StatusTag`, `BottomNav`, `TopBar` | `partial`: `Worker / Mine / Default`, node `1:2811`, inventory exists | worker tokens; certification visuals must not create qualification state | READY |
| `/worker/certification` | worker | `worker.certification.status.notWired`; future `worker.certification.apply` | `CONTRACT_WORKER_CERTIFICATION.md`; `POST /api/worker/certifications`; admin approve/reject endpoints exist for admin review | current route maps to profile/certification shell; future pending/approved/rejected from backend certification row | no apply/re-submit button until certification action contract exists and city/user headers are enforced | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED`, `IDENTITY_REQUIRED`, `CITY_SCOPE_REQUIRED` | `stateBadge`, `guardrail`, `notWired`, `bottomNav`, `themeSurface` | `Card`, `Timeline`, `NotWiredState`, `StatusTag`, `Button`, `BottomNav` | `partial`: derived from `Worker / Mine / Default`; no standalone certification frame | worker tokens; visual-only | READY |
| `/admin/` | admin | current `admin.settlement.dashboard`; future `admin.dashboard` | current app routes to settlement ops; `CONTRACT_SETTLEMENT_*`; `CONTRACT_WORKER_RECEIVABLE_STATEMENT.md`; `settlementApi` audit/read endpoints | settlement audit summary / review summary / gap scan / statement audit from backend; no dashboard metrics may be fabricated | refresh/read/navigation actions are API-backed or route navigation; settlement mutation actions require explicit `ActionContract` before repair | backend error, city scope guardrail, `DESIGN_SOURCE_MISSING`, `AUDIT_REQUIRED` | `adminToolbar`, `summaryCard`, `stateBadge`, `guardrail`, `apiError`, `tableActions`, `themeSurface` | `AdminShell`, `TopBar`, `SideNav`, `AdminToolbar`, `MetricCard`, `ScopeBadge`, `Table`, `ApiErrorPanel`, `LoadingState`, `EmptyState` | `DESIGN_SOURCE_MISSING`: `Admin / Dashboard / Default` exists but does not match current Settlement route | admin accent `#191225`, compact admin controls radius 8, table/status tokens; visual-only | BLOCKED |
| `Settlement Ops` | admin | `admin.settlement.dashboard` | `GET /api/internal/settlement/worker-statement-audit`; `GET /api/internal/settlement/worker-statement-review-summary`; `GET /api/internal/settlement/settlement-audit-summary`; `GET /api/internal/settlement/reconciliation-gap-scan` | read-only audit/summary states from backend | refresh/load-more/detail/export/governance navigation; no settlement execution; Phase 15.3F must define row/nav actions as `ActionContract` or non-business navigation | backend 400/403/404/raw error, `CITY_SCOPE_REQUIRED`, `AUDIT_REQUIRED`, `DESIGN_SOURCE_MISSING` | `adminToolbar`, `tableActions`, `stateBadge`, `guardrail`, `apiError`, `themeSurface` | `AdminToolbar`, `ScopeBadge`, `MetricCard`, `Table`, `StatusTag`, `ApiErrorPanel`, `Button` | `DESIGN_SOURCE_MISSING`: no settlement Figma frame | admin tokens only; no theme-driven settlement status | BLOCKED |
| `Governance` | admin | `admin.governance.hash`; `admin.settlementAction.governance` | `CONTRACT_SETTLEMENT_ACTION_INTENT.md`; governance dry-run planner endpoints under `/api/internal/settlement-action-governance/*` | governance-only draft/ready/blocked/archived; dry-run plan status from backend | `FRONTEND_ACTION_LEAK` found in current UI: generate dry-run plan uses `packet-placeholder`; must be replaced by backend readiness-packet-derived action source before 15.3F | `EXECUTION_DISABLED`, `AUDIT_REQUIRED`, `IDEMPOTENCY_REQUIRED`, `DESIGN_SOURCE_MISSING`, backend error | `adminToolbar`, `guardrail`, `apiError`, `tableActions`, `notWired`, `themeSurface` | `AdminToolbar`, `GuardrailCard`, `StatusTag`, `Table`, `Button`, `ApiErrorPanel` | `DESIGN_SOURCE_MISSING`: no governance/hash frame | admin tokens only; theme must not hide execution-disabled boundary | BLOCKED |
| `Export Review` | admin | `admin.export.review` | `GET /api/internal/settlement/worker-statement-export-audit`; evidence refs in `CONTRACT_SETTLEMENT_ACTION_INTENT.md` do not generate/download files | export audit read states only; no file generation/download state | refresh/load more/detail navigation only; generation/download actions forbidden until backend contract exists | `EXECUTION_DISABLED`, `AUDIT_REQUIRED`, `DESIGN_SOURCE_MISSING`, backend error | `adminToolbar`, `tableActions`, `stateBadge`, `apiError`, `emptyState`, `themeSurface` | `Table`, `StatusTag`, `Button`, `ApiErrorPanel`, `EmptyState`, `ScopeBadge` | `DESIGN_SOURCE_MISSING`: no export review frame | admin tokens; no theme-driven export availability | BLOCKED |
| `Statement Detail` | admin | `admin.statement.detail` | `GET /api/internal/settlement/worker-statement-audit/:statementId`; `CONTRACT_WORKER_RECEIVABLE_STATEMENT.md` | statement, review, export, outbox evidence read from backend; not editable in UI | back/navigation to export review only; review/export mutation must remain disabled unless backend action contract exists | `STATE_NOT_ACTIONABLE`, `AUDIT_REQUIRED`, `CITY_SCOPE_REQUIRED`, `DESIGN_SOURCE_MISSING`, backend error | `summaryCard`, `workflowTimeline`, `stateBadge`, `apiError`, `tableActions`, `themeSurface` | `Card`, `Timeline`, `PriceText`, `ScopeBadge`, `StatusTag`, `Table`, `ApiErrorPanel`, `Button` | `DESIGN_SOURCE_MISSING`: no statement detail frame | admin tokens only | BLOCKED |
| `Governance hash pages` | admin | `admin.governance.hash` | dry-run plan hash/readiness endpoints in `governancePlannerApi`; `CONTRACT_SETTLEMENT_ACTION_INTENT.md` boundary | plan hash/status/readiness from backend; governance only | hash/readiness actions must come from backend plan/readiness packet; no placeholder packet ids | `AUDIT_REQUIRED`, `IDEMPOTENCY_REQUIRED`, `EXECUTION_DISABLED`, `DESIGN_SOURCE_MISSING`, backend error | `adminToolbar`, `stateBadge`, `guardrail`, `apiError`, `tableActions`, `themeSurface` | `Table`, `StatusTag`, `Button`, `ApiErrorPanel`, `GuardrailCard` | `DESIGN_SOURCE_MISSING`: no governance hash frame | admin tokens only; no theme-driven hash/readiness changes | BLOCKED |

## 2. Action Source Gate

| scope | gate result | evidence | required before Phase 15.3F code work |
| --- | --- | --- | --- |
| Customer catalog/service navigation | PASS | Route actions are navigation based on backend catalog SKU ids, not business mutations. | Keep as navigation actions; if shown in `ActionDock`, label them non-mutating. |
| Customer order submit/payment-order create | PASS_WITH_CONDITION | Endpoints and state machine are documented in `CONTRACT_ORDER.md`, `CONTRACT_PRICING.md`, and `CONTRACT_PAYMENT.md`; current UI uses quote success and selected backend SKU before calling create endpoints. | Wrap submit/retry/view-order in explicit `ActionContract` view model; do not expose mock webhook payment success. |
| Customer orders/profile not-wired actions | PASS | List/profile capabilities are documented as not-wired or read-only; no fake order list/profile API. | Preserve disabled reason codes and not-wired policy. |
| Worker hall/tasks/wallet/profile/certification | PASS | Current functional worker actions are disabled/read-only; future task/accept/fulfillment contracts exist but are not enabled in app shell. | Do not enable accept/start/complete/certification buttons until task pool, eligibility, city binding, worker identity, and idempotency are bound. |
| Admin settlement read/refresh/navigation | PARTIAL | Read APIs are real, but toolbar/table actions are not represented as a normalized `ActionContract` list. | Define route-level `ActionContract` records for refresh, pagination, statement navigation, export review navigation, governance navigation, and any future mutation. |
| Admin governance dry-run plan generation | `FRONTEND_ACTION_LEAK` | Current UI calls `createSettlementDryRunPlan("packet-placeholder")`. The packet id is frontend supplied, not a backend available action/readiness-packet source. | Block Admin 15.3F pixel repair until the button is removed, disabled, or sourced from backend readiness packet availability with audit/idempotency metadata. |
| Admin disabled execution buttons | PASS_WITH_CONDITION | Buttons are disabled and documented as execution disabled; no API handler for payout/refund/reversal/commit/export generation. | Keep disabled reason `EXECUTION_DISABLED`; do not hide raw backend/governance errors. |

Conclusion: no Phase 15.3F route may add new executable buttons from Figma. C/W can proceed with explicit action view models. Admin cannot proceed to pixel repair for Settlement/Governance until the `FRONTEND_ACTION_LEAK` and missing design source are resolved or explicitly kept outside the repair scope.

## 3. Figma Source Gate

| route/surface | Figma source result | frame evidence | gate |
| --- | --- | --- | --- |
| `/customer/` | partial frame | `Customer / Home / Default`, node `1:228`, `frames/customer/customer_home_default_1-228.png` | PASS |
| `/customer/services` | partial frame | `Customer / Services / Default`, node `1:411`, inventory only | PASS |
| `/customer/order/create` | exact frame | `Customer / CreateOrder / Default`, node `1:594`, `frames/customer/customer_createorder_default_1-594.png`; loading/success/error frames exist | PASS |
| `/customer/orders` | partial frame | `Customer / Orders / All`, `Orders / Empty`, `OrderDetail / InProgress`, nodes `1:824`, `1:947`, `1:1013` | PASS |
| `/customer/profile` | partial frame | `Customer / Mine / Default`, `Settings / Default`, nodes `1:1359`, `1:1440` | PASS |
| `/worker/` | exact frame | `Worker / GrabHall / Online`, node `1:1515`, `frames/worker/worker_grabhall_online_1-1515.png`; paused/loading/empty/error states exist | PASS |
| `/worker/tasks` | partial frame | `Worker / Tasks / Accepted`, `TaskDetail / InProgress`, nodes `1:2452`, `1:2543` | PASS |
| `/worker/wallet` | partial frame | `Worker / Income / Default`, node `1:2742` | PASS |
| `/worker/profile` | partial frame | `Worker / Mine / Default`, node `1:2811` | PASS |
| `/worker/certification` | partial frame | derived from `Worker / Mine / Default`; no standalone certification frame | PASS_WITH_NOTE |
| `/admin/` current Settlement shell | `DESIGN_SOURCE_MISSING` | `Admin / Dashboard / Default` exists but does not map to current Settlement route | BLOCK |
| Settlement Ops | `DESIGN_SOURCE_MISSING` | no settlement frame in `pages.json` or exported PNG index | BLOCK |
| Governance | `DESIGN_SOURCE_MISSING` | no governance/hash frame in `pages.json` or exported PNG index | BLOCK |
| Export Review | `DESIGN_SOURCE_MISSING` | no export review frame in `pages.json` or exported PNG index | BLOCK |
| Statement Detail | `DESIGN_SOURCE_MISSING` | no statement detail frame in `pages.json` or exported PNG index | BLOCK |
| Governance hash pages | `DESIGN_SOURCE_MISSING` | no governance hash frame in `pages.json` or exported PNG index | BLOCK |

Admin Settlement/Governance must not be promoted to `exact`. The current admin Figma frames may inform derived shell/table/status styling only for non-high-fidelity harmonization.

## 4. Runtime Theming Gate

| rule | result | evidence |
| --- | --- | --- |
| Page hardcoded festival colors are forbidden | PASS | `CONTRACT_RUNTIME_THEMING_TOKENS.md` requires all visual theming through tokens and forbids page-level festival/campaign hardcodes. |
| Page hardcoded campaign/activity styles are forbidden | PASS | Contract defines city/campaign/festival overrides as token-only visual overrides with default fallback. |
| Business logic affected by `activeTheme` is forbidden | PASS | Runtime theme scope is `affects: "visual-only"`; workflow state, endpoint selection, permissions, audit, idempotency, and city scope are forbidden theme keys. |
| Theme switch changing order/payment/dispatch/settlement/refund/permission/audit/idempotency is forbidden | PASS | Both the theme contract and master plan explicitly forbid those behavior changes. |
| Fallback is safe when remote theme is invalid | PASS | Theme fallback order resolves to parent/default/package fallback; remote config must be validated and fail closed. |
| Figma PNGs used as runtime backgrounds are forbidden | PASS | Theme asset contract and visual refinement skill both forbid using local Figma PNGs to fake implementation. |

Runtime theming is architecturally safe for Phase 15.3F only if implementation keeps theme tokens inside `packages/ui`/component token consumption and never branches workflow behavior on `activeTheme`.

## 5. Phase 15.3F Entry Judgment

Final judgment: `PARTIAL GO: only Customer and Worker may enter Pixel Repair; Admin is paused`.

Allowed for Phase 15.3F:

- Customer routes listed in this report.
- Worker routes listed in this report.
- `packages/ui` / route code only if the next phase explicitly permits code changes.
- Pixel repair against exact/partial Figma frames with browser screenshot comparison.
- Explicit `WorkflowUiBinding` / `ActionContract` adapters before enabling or restyling functional actions.

Blocked for Phase 15.3F:

- Admin Settlement / Governance / Export Review / Statement Detail / Governance hash high-fidelity pixel repair.
- Any Admin claim of exact Figma binding for settlement/governance routes.
- Any new frontend-generated business action.
- Current governance dry-run generation using `packet-placeholder` as a repaired/approved behavior.
- Production deployment and tag creation.

Required before Admin can enter pixel repair:

1. Dedicated Figma frames for Settlement/Governance/Export Review/Statement Detail/Governance hash, or a human-approved derived-design phase that explicitly does not claim exact pixel match.
2. Route-level Admin `ActionContract` list for toolbar, row, review, export, governance, hash, and dry-run actions.
3. Removal or backend-sourcing of the `packet-placeholder` dry-run action.
4. Confirmation that raw backend 400/403/409/500 errors and city-scope guardrails remain visible.

## Verification Checklist

- `git status --short`: to be recorded after file edits.
- `git rev-parse HEAD`: to be recorded after file edits.
- Allowed-path check: only `docs/reports/PHASE15_3E_WORKFLOW_FIGMA_UI_ARCH_GATE_REPORT.md` and `docs/execution/PHASE15_PROGRESS.md` may change.
- Deployment: not performed.
- Tag: not created.

