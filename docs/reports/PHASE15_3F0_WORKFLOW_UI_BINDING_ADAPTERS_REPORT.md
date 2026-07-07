# Phase 15.3F-0 Workflow UI Binding Adapters Report

## Scope

- Phase: `15.3F-0 - Customer Worker Workflow UI Binding Adapters`.
- Goal: add explicit Customer / Worker route `WorkflowUiBinding` and `WorkflowActionContract` adapters before constrained Figma Pixel Repair.
- Production: `NO-GO`.
- Tag: not created.
- Admin: not modified; Settlement / Governance remain blocked by `DESIGN_SOURCE_MISSING`.

## Implementation Summary

- Added shared workflow UI binding types in `packages/types/src/workflowUiBinding.ts`.
- Added workflow expression components in `packages/ui/src/components/index.tsx`:
  - `ActionDock`
  - `WorkflowTimeline`
  - `WorkflowStatePanel`
  - `DisabledReasonText`
  - `CustomerAnswerCard`
  - `WorkerAnswerCard`
  - `RuntimeThemeSurface`
- Added Customer adapters in `apps/customer/src/adapters/workflowBindings.ts`.
- Added Worker adapters in `apps/worker/src/adapters/workflowBindings.ts`.
- Connected Customer / Worker app pages to adapters without pixel repair and without creating new backend APIs.

## Route Workflow Binding Matrix

| route | actor | workflowName | backendSource | workflowStates | availableActionsSource | disabledReasonSource | uiSlots | packagesUiComponents | figmaBinding | runtimeThemeTokens | readiness |
|---|---|---|---|---|---|---|---|---|---|---|---|
| `/customer/` | customer | `customer.catalog.browsing` | `GET /api/catalog` | `catalog.ready-or-loading` | `api-derived` from catalog API and route navigation | API error / retry state | `pageHero`, `summaryCard`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `MobileShell`, `TopBar`, `HeroCard`, `SearchBar`, `ServiceCard`, `ActionDock`, `CustomerAnswerCard` | `partial` | `customer-default`, visual-only | READY |
| `/customer/services` | customer | `customer.catalog.browsing` | `GET /api/catalog` | `catalog.filtering` | `api-derived` from backend catalog SKUs | API error / retry state | `summaryCard`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `SearchBar`, `Tabs`, `ServiceCard`, `ActionDock`, `CustomerAnswerCard` | `partial` | `customer-default`, visual-only | READY |
| `/customer/order/create` | customer | `customer.order.create` | `GET /api/pricing/quote`, `POST /api/orders`, `POST /api/payments/orders`, `GET /api/orders/:orderId` | `quote.required`, `quote.ready` | `backend` for submit order, `api-derived` for quote retry/order view | quote readiness, selected SKU, submit state, API error | `summaryCard`, `primaryActionDock`, `workflowTimeline`, `stateBadge`, `apiError`, `guardrail`, `themeSurface` | `CustomerQuoteCard`, `ActionDock`, `WorkflowTimeline`, `OrderCard`, `CustomerAnswerCard` | `exact` | `customer-default`, visual-only | READY |
| `/customer/orders` | customer | `customer.order.list.notWired` | partial: `GET /api/orders/:orderId`; no list API | `order.list.not-wired` | `api-derived` detail re-read only when real local order IDs exist; list is `not-wired` | `WORKFLOW_NOT_IMPLEMENTED` | `workflowTimeline`, `stateBadge`, `notWired`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `OrderCard`, `WorkflowTimeline`, `NotWiredState`, `ActionDock`, `CustomerAnswerCard` | `partial` | `customer-default`, visual-only | PARTIAL |
| `/customer/profile` | customer | `customer.profile.notWired` | none: profile/address/auth APIs unavailable | `profile.not-wired` | `not-wired` disabled actions only | `API_NOT_AVAILABLE`, `IDENTITY_REQUIRED` | `notWired`, `summaryCard`, `bottomNav`, `themeSurface` | `Card`, `NotWiredState`, `ActionDock`, `CustomerAnswerCard` | `partial` | `customer-default`, visual-only | PARTIAL |
| `/worker/` | worker | `worker.taskPool.notWired` | intended task-pool / accept endpoints are not wired | `task-pool.not-wired` | `not-wired` disabled actions only | `API_NOT_AVAILABLE`, `WORKFLOW_NOT_IMPLEMENTED` | `pageHero`, `summaryCard`, `stateBadge`, `guardrail`, `notWired`, `emptyState`, `bottomNav`, `themeSurface` | `WorkerStatusCard`, `ActionDock`, `WorkerAnswerCard`, `WorkflowTimeline`, `NotWiredState` | `exact` | `worker-default`, visual-only | PARTIAL |
| `/worker/tasks` | worker | `worker.fulfillment.tasks.notWired` | intended fulfillment endpoints are not wired | `fulfillment.not-wired` | `not-wired` disabled actions only | `WORKFLOW_NOT_IMPLEMENTED` | `workflowTimeline`, `stateBadge`, `guardrail`, `notWired`, `emptyState`, `apiError`, `bottomNav`, `themeSurface` | `WorkerTaskCard`, `ActionDock`, `WorkerAnswerCard`, `WorkflowTimeline`, `NotWiredState` | `partial` | `worker-default`, visual-only | PARTIAL |
| `/worker/wallet` | worker | `worker.wallet.notWired` | no worker wallet/income API wired | `wallet.not-wired` | `not-wired` disabled actions only | `API_NOT_AVAILABLE`, `PHASE_BOUNDARY` | `summaryCard`, `notWired`, `guardrail`, `bottomNav`, `themeSurface` | `MetricCard`, `ActionDock`, `WorkerAnswerCard`, `NotWiredState` | `partial` | `worker-default`, visual-only | PARTIAL |
| `/worker/profile` | worker | `worker.profile.read.notWired` | no worker profile/certification API wired | `profile.not-wired` | `not-wired` disabled actions only | `API_NOT_AVAILABLE`, `IDENTITY_REQUIRED` | `summaryCard`, `stateBadge`, `guardrail`, `notWired`, `bottomNav`, `themeSurface` | `Card`, `ActionDock`, `WorkerAnswerCard`, `NotWiredState` | `partial` | `worker-default`, visual-only | PARTIAL |
| `/worker/certification` | worker | `worker.certification.status.notWired` | intended certification/eligibility endpoints are not wired | `certification.not-wired` | `not-wired` disabled actions only | `API_NOT_AVAILABLE`, `IDENTITY_REQUIRED` | `stateBadge`, `guardrail`, `notWired`, `bottomNav`, `themeSurface` | `Card`, `ActionDock`, `WorkerAnswerCard`, `NotWiredState` | `partial` | `worker-default`, visual-only | PARTIAL |

## Action Source Gate

- PASS: `WorkflowActionContract` requires `actionId`, `label`, `enabled`, `disabledReasonCode`, `source`, `danger`, `confirmRequired`, `idempotencyRequired`, `auditRequired`, and `cityScopeRequired`.
- PASS: Customer catalog/service selection actions are `api-derived` from existing catalog facts.
- PASS: Customer order submission is `source=backend`, requires quote readiness, selected SKU, and non-submitting state; `POST /api/orders` is idempotency-required by adapter policy.
- PASS: Customer profile/address/auth actions are disabled `source=not-wired`.
- PASS: Worker task pool, accept, fulfillment, wallet, profile, and certification actions are disabled `source=not-wired`.
- PASS: No worker page displays "can accept order" from frontend local state; `workerAnswer.canAcceptOrder=false` until backend workflow exists.
- Finding: no new `FRONTEND_ACTION_LEAK` introduced in Customer / Worker adapters.

## Figma Source Gate

- Customer create order is `exact`.
- Customer home, services, orders, and profile are `partial`.
- Worker grab hall is `exact`.
- Worker tasks, wallet, profile, and certification are `partial`.
- Admin Settlement / Governance remain `DESIGN_SOURCE_MISSING` per Phase 15.3E-VERIFY and were not modified.

## Runtime Theming Gate

- PASS: `WorkflowRuntimeThemeTokens.affects` is constrained to `visual-only`.
- PASS: Customer and Worker adapters use `customer-default` / `worker-default` token references only.
- PASS: No adapter lets active theme alter order, payment, dispatch, settlement, refund, permissions, audit, city scope, or idempotency.
- PASS: `RuntimeThemeSurface` only emits data attributes and layout wrapper state; it does not run business logic.

## Not-Wired Policy Gate

- PASS: Customer order list does not fabricate orders. It may only re-read real order IDs created in the current browser session through `GET /api/orders/:orderId`.
- PASS: Customer profile does not fabricate user profile, address, or login state.
- PASS: Worker hall/tasks do not fabricate task pool, task detail, accept state, or fulfillment success.
- PASS: Worker wallet does not fabricate income, withdrawal, or settlement.
- PASS: Worker profile/certification do not fabricate credentials, service city, or eligibility.

## Phase 15.3F Entry Judgment

Result: `PARTIAL GO`.

- Customer / Worker may proceed to constrained Pixel Repair using these adapters as the route data contract.
- Admin Pixel Repair remains blocked for Settlement / Governance until exact Figma sources exist.
- Production remains `NO-GO`.
- No tag was created.

## Verification

- `pnpm --filter @xlb/types typecheck`: PASS.
- `pnpm --filter @xlb/ui typecheck`: PASS.
- `pnpm --filter @xlb/ui build`: PASS.
- `pnpm --filter @xlb/customer typecheck`: PASS.
- `pnpm --filter @xlb/customer build`: PASS.
- `pnpm --filter @xlb/worker typecheck`: PASS.
- `pnpm --filter @xlb/worker build`: PASS.
- `pnpm test -- --bail=1`: BLOCKED by local DB availability. The rerun failed on DB-backed tests with `connect ECONNREFUSED 127.0.0.1:3306`; `docker ps` also failed because the Docker daemon was not available at `npipe:////./pipe/dockerDesktopLinuxEngine`.
- `rg "Phase 0 Ready" apps/customer apps/worker`: PASS, no matches.
- `rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker packages/api-client`: PASS, no matches.
- `rg "mock|fake|dummy" apps/customer apps/worker packages/api-client`: REVIEWED. Matches are limited to existing `packages/api-client/src/customer.ts` local payment mock-webhook helper; this phase did not modify it or use it from Customer / Worker UI.
- `rg "availableActions|WorkflowUiBinding|ActionContract|not-wired" apps/customer apps/worker packages/types packages/ui`: PASS, bindings and not-wired policies are present.
- `git diff --check`: PASS.
- Changed path scope: PASS, only allowed Customer / Worker / packages/types / packages/ui / docs report-progress paths changed.
