# CONTRACT_WORKFLOW_UI_BINDING

## Scope

This contract defines how backend workflows bind to Figma routes and frontend UI components in Phase 15.

The project rule is:

**Backend workflow drives behavior. Figma drives visual expression. `packages/ui` carries reusable presentation components.**

Figma must not invent executable business actions. Frontend pages must not infer enabled actions from visual state alone. `packages/ui` must not execute business logic, call business APIs, mutate workflow state, or decide whether an action is allowed.

## Non-Negotiable Rules

1. Every user-visible executable button must be backed by a backend workflow or API contract.
2. Every disabled action must expose a machine-readable `disabledReasonCode`.
3. Every state transition must come from backend state, API response, or documented not-wired policy.
4. Figma may define layout, hierarchy, density, color, typography, icon placement, and state presentation.
5. Figma may not define money movement, dispatch acceptance, audit execution, settlement execution, payment completion, or hidden workflow transitions.
6. `packages/ui` may render action docks, toolbars, cards, timelines, badges, and error panels.
7. `packages/ui` may not import `@xlb/api-client`, know endpoint URLs, or call workflow APIs.
8. If a route has no backend contract, the route must render `not-wired` or read-only state instead of fake success data.
9. If a route has no Figma frame, it must be marked `DESIGN_SOURCE_MISSING` and cannot be called high-fidelity Figma complete.
10. Phase 15.3F pixel repair must not proceed for a route until `route -> figmaFrame -> workflowName -> availableActions -> packagesUiComponents` is mapped.

## Workflow UI Binding Contract

Each route-level binding must be described with this shape:

```ts
type WorkflowUiBinding = {
  workflowName: string;
  route: string;
  actor: "customer" | "worker" | "admin";
  backendSource: {
    contractDocs: string[];
    endpoints: string[];
    modules?: string[];
    status: "wired" | "partial" | "not-wired" | "read-only" | "design-source-missing";
  };
  state: {
    stateId: string;
    source: "backend" | "api-contract" | "frontend-derived-from-api" | "not-wired-policy";
    terminal?: boolean;
    customerAnswer?: CustomerAnswerModel;
  };
  availableActions: ActionContract[];
  disabledReasonCode?: string;
  customerFacingCopy: {
    titleKey: string;
    bodyKey?: string;
    primaryCtaKey?: string;
    secondaryCtaKey?: string;
  };
  uiSlots: UiSlot[];
  figmaFrame: FigmaBinding;
  packagesUiComponents: string[];
  notWiredPolicy?: NotWiredPolicy;
};
```

Required fields:

| Field | Rule |
| --- | --- |
| `workflowName` | Stable workflow identifier, for example `customer.order.create`. |
| `route` | Browser route or route pattern, for example `/customer/order/create`. |
| `actor` | Must be one of `customer`, `worker`, or `admin`. |
| `backendSource` | Must cite existing backend contract docs and endpoints. If missing, mark `not-wired`. |
| `state` | Must be derived from backend/API/not-wired policy, not Figma. |
| `availableActions` | The only source of executable buttons. |
| `disabledReasonCode` | Required whenever an action or workflow is blocked. |
| `customerFacingCopy` | UI copy keys or text scope for the state. Chinese display copy should be resolved by app layer. |
| `uiSlots` | Where the workflow binds into visual components. |
| `figmaFrame` | Must be `exact frame`, `partial frame`, `derived design`, or `DESIGN_SOURCE_MISSING`. |
| `packagesUiComponents` | Reusable presentation components used to render the state. |
| `notWiredPolicy` | Required when backend API or product workflow is missing. |

## Action Contract

All executable UI actions must come from this contract shape:

```ts
type ActionContract = {
  actionId: string;
  labelKey: string;
  enabled: boolean;
  disabledReasonCode?: string;
  danger: boolean;
  confirmRequired: boolean;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  idempotencyRequired: boolean;
  auditRequired: boolean;
};
```

Field rules:

| Field | Rule |
| --- | --- |
| `actionId` | Stable backend or workflow action identifier. It must not be a Figma layer name. |
| `labelKey` | User-facing label key. UI may localize this, but may not change action semantics. |
| `enabled` | Must be determined by backend/API state or not-wired policy. |
| `disabledReasonCode` | Required when `enabled=false`. |
| `danger` | Required for destructive, irreversible, payment, settlement, audit, or admin mutation actions. |
| `confirmRequired` | Required for money movement, audit, irreversible, destructive, or governance-affecting actions. |
| `endpoint` | Required when the action is executable. Omit only for navigation/read-only/not-wired actions. |
| `method` | Required when `endpoint` is present. |
| `idempotencyRequired` | Required for create, payment, audit, settlement, dispatch, and retryable mutations. |
| `auditRequired` | Required for admin, settlement, governance, payment, dispatch, and worker acceptance actions. |

Forbidden:

- A button that calls an endpoint without an `actionId`.
- A button enabled because it is visually prominent in Figma.
- A disabled button without `disabledReasonCode`.
- A settlement, audit, dispatch, or payment action without explicit backend contract.
- A `packages/ui` component that decides `enabled` from local visual props alone.

## Customer Answer Model

Every customer-visible state must answer four questions in plain Chinese copy:

```ts
type CustomerAnswerModel = {
  currentStep: string;
  nextAvailableStep: string;
  blockedReason?: string;
  estimatedTime?: string;
  recoveryPath?: string;
};
```

Required answers:

| Question | Required source |
| --- | --- |
| 当前在哪一步 | Backend order/payment/catalog/pricing state or explicit not-wired policy. |
| 下一步能做什么 | `availableActions` from backend workflow. |
| 为什么不能做 | `disabledReasonCode` mapped to customer copy. |
| 预计多久 | Backend SLA/contract if available; otherwise `unknown` or not shown. |
| 出问题怎么办 | Retry, refresh, contact support, or not-wired explanation based on backend error policy. |

Customer copy must not claim:

- Payment succeeded unless backend payment/order state says so.
- Order was dispatched unless dispatch workflow says so.
- A worker accepted the job unless worker/dispatch workflow says so.
- Profile/address/account data exists when no backend API exists.

## UI Slots

```ts
type UiSlot =
  | "pageHero"
  | "summaryCard"
  | "primaryActionDock"
  | "secondaryActions"
  | "workflowTimeline"
  | "stateBadge"
  | "guardrail"
  | "notWired"
  | "apiError"
  | "emptyState"
  | "adminToolbar"
  | "tableActions"
  | "bottomNav";
```

Slot binding rules:

| Data | UI slot | Component examples |
| --- | --- | --- |
| `availableActions` | `primaryActionDock`, `adminToolbar`, `tableActions` | `ActionDock`, `AdminToolbar`, `Button` |
| order or workflow state | `workflowTimeline`, `stateBadge` | `WorkflowTimeline`, `StateBadge`, `StatusTag` |
| disabled reason | `guardrail` | `GuardrailCard` |
| pending payment | `summaryCard`, `primaryActionDock` | `CustomerAnswerCard`, `CustomerQuoteCard`, `Button` |
| not-wired feature | `notWired` | `NotWiredState` |
| API error | `apiError` | `ApiErrorPanel`, `ErrorState` |
| city scope | `stateBadge`, `guardrail` | `ScopeBadge`, `GuardrailCard` |

## Figma Binding Rule

```ts
type FigmaBinding = {
  status: "exact frame" | "partial frame" | "derived design" | "DESIGN_SOURCE_MISSING";
  frameName?: string;
  nodeId?: string;
  localPng?: string;
  notes?: string;
};
```

Binding rules:

| Status | Meaning | High-fidelity claim allowed |
| --- | --- | --- |
| `exact frame` | Route has a direct Figma frame and local PNG. | Yes, after screenshot comparison passes. |
| `partial frame` | Route maps to a related Figma frame but has missing states or route variants. | No full-route high-fidelity claim. |
| `derived design` | Route is adapted from role-level Figma visual language. | No high-fidelity claim. |
| `DESIGN_SOURCE_MISSING` | No matching Figma frame exists. | Never. |

Admin Settlement/Governance routes currently have no dedicated Figma frames and must be marked `DESIGN_SOURCE_MISSING` until new design source is provided or explicit product approval allows derived visual adaptation.

## Not-Wired Policy

```ts
type NotWiredPolicy = {
  reasonCode: string;
  userCopy: string;
  allowedUi: "empty" | "read-only-shell" | "disabled-action" | "guardrail";
  forbiddenClaims: string[];
  allowedActions: ActionContract[];
};
```

Default not-wired reasons:

| Reason code | Meaning |
| --- | --- |
| `API_NOT_AVAILABLE` | Backend API does not exist. |
| `WORKFLOW_NOT_IMPLEMENTED` | Backend workflow contract exists but execution is not implemented. |
| `DESIGN_SOURCE_MISSING` | No Figma frame exists for high-fidelity implementation. |
| `PHASE_BOUNDARY` | Current phase forbids the workflow. |
| `CITY_SCOPE_REQUIRED` | User/request lacks valid city scope. |
| `IDENTITY_REQUIRED` | Workflow requires a real actor identity not available in current app. |
| `AUDIT_REQUIRED` | Action requires audit trail or governance review. |
| `EXECUTION_DISABLED` | Execution is explicitly disabled by phase or backend contract. |

## Three-App Workflow Mapping

### Customer

| Workflow | Route | Backend source | State | Actions | Figma binding | UI components | Policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `customer.catalog.browsing` | `/customer/`, `/customer/services` | `CONTRACT_CATALOG.md`, `GET /api/catalog` | catalog loaded/empty/error from API | `catalog.search`, `catalog.selectSku` as UI/navigation actions only | partial/exact per Home and Services frames | `MobileShell`, `SearchBar`, `ServiceCard`, `EmptyState`, `ApiErrorPanel` | No fake SKUs. |
| `customer.pricing.quote` | `/customer/order/create` | `CONTRACT_PRICING.md`, `GET /api/pricing/quote?skuId=...` | quote loaded/empty/error from API | `pricing.refreshQuote` | exact frame: `Customer / CreateOrder / Default` if screenshot repair passes | `CustomerQuoteCard`, `PriceText`, `LoadingState`, `ApiErrorPanel` | Do not invent price. |
| `customer.order.create` | `/customer/order/create` | `CONTRACT_ORDER.md`, `POST /api/orders` | draft -> `pending_payment` | `order.create` | exact frame candidate: `Customer / CreateOrder / Default` | `ActionDock`, `Button`, `CustomerAnswerCard`, `GuardrailCard` | Idempotency should be required before repeat-submit UX. |
| `customer.order.pendingPayment` | `/customer/order/create`, future detail route | `CONTRACT_ORDER.md`, `CONTRACT_PAYMENT.md` | `pending_payment` | `payment.createOrder` | partial frame: CreateOrder/OrderDetail | `WorkflowTimeline`, `CustomerAnswerCard`, `StateBadge` | Do not claim payment success. |
| `customer.payment.orderCreated` | `/customer/order/create` | `CONTRACT_PAYMENT.md`, `POST /api/payments/orders` | payment order `pending` | no real provider checkout in current UI | partial frame: OrderDetail | `CustomerAnswerCard`, `GuardrailCard` | Real provider callback not wired. |
| `customer.order.detail` | future `/customer/orders/:orderId` or current inline detail | `CONTRACT_ORDER.md`, `GET /api/orders/:orderId` | backend order state | `order.refreshDetail` | exact frame candidate: `Customer / OrderDetail / InProgress` | `OrderCard`, `WorkflowTimeline`, `StateBadge`, `ApiErrorPanel` | Do not show dispatch/worker states unless backend says so. |
| `customer.order.list.notWired` | `/customer/orders` | no customer list API found | `not-wired` | disabled `order.list` | partial frame: `Customer / Orders / All`, `Orders / Empty` | `NotWiredState`, `OrderCard`, `EmptyState` | Do not fabricate order list. |
| `customer.profile.notWired` | `/customer/profile` | no customer profile/account API found | `not-wired` | disabled `profile.read`, `address.manage` | partial frame: `Customer / Mine / Default` | `NotWiredState`, `Card`, `GuardrailCard` | Do not fabricate user/address/account data. |

Customer answer examples:

| State | 当前在哪一步 | 下一步能做什么 | 为什么不能做 | 预计多久 | 出问题怎么办 |
| --- | --- | --- | --- | --- | --- |
| catalog loaded | 正在选择服务 | 选择服务并进入下单 | - | unknown | 刷新服务列表或稍后再试 |
| quote loaded | 已获得价格试算 | 提交订单 | - | unknown | 重新试算或返回选择服务 |
| pending_payment | 订单已创建，等待支付 | 创建支付单或继续查看订单 | 支付渠道未完成真实接入时显示 `WORKFLOW_NOT_IMPLEMENTED` | unknown | 保留订单号并刷新详情 |
| order list not-wired | 订单列表接口未接入 | 暂不可查看完整列表 | `API_NOT_AVAILABLE` | unknown | 使用已创建订单详情或等待后续阶段 |
| profile not-wired | 账户资料接口未接入 | 暂不可编辑资料 | `API_NOT_AVAILABLE` | unknown | 等待 profile/account API |

### Worker

| Workflow | Route | Backend source | State | Actions | Figma binding | UI components | Policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `worker.profile.read` | `/worker/profile` | `CONTRACT_WORKER_PROFILE.md` if API available; otherwise partial/not-wired | profile read/empty/not-wired | `worker.profile.refresh` | partial frame: `Worker / Mine / Default` | `MobileShell`, `WorkerStatusCard`, `NotWiredState` | Do not fabricate worker identity details. |
| `worker.certification.status` | `/worker/certification`, `/worker/profile` | `CONTRACT_WORKER_CERTIFICATION.md`, `CONTRACT_WORKER_QUALIFICATION.md` | certification state from API or not-wired | disabled `certification.submit` until backend supports | partial frame: worker mine/certification surfaces | `StateBadge`, `GuardrailCard`, `NotWiredState` | No fake credentials. |
| `worker.taskPool.notWired` | `/worker/`, `/worker/tasks` | `CONTRACT_WORKER_TASK_POOL.md`, `GET /api/worker/task-pool` if wired; current UI may remain not-wired | task pool read-only or not-wired | disabled `task.accept` | exact/partial frame: `Worker / GrabHall / Online`, `Paused` | `WorkOrderCard`, `WorkerTaskCard`, `NotWiredState`, `ApiErrorPanel` | No fake nearby tasks. |
| `worker.eligibility.notWired` | `/worker/`, `/worker/profile` | `CONTRACT_WORKER_ELIGIBILITY.md` | eligibility unknown/not-wired | disabled `eligibility.check` | partial frame | `GuardrailCard`, `StateBadge`, `NotWiredState` | Do not infer eligibility from UI. |
| `worker.acceptOrder.unavailable` | `/worker/`, `/worker/tasks` | `CONTRACT_WORKER_ACCEPT.md` | execution unavailable unless backend enables | disabled `worker.acceptOrder` with reason | partial frame: grab hall | `ActionDock`, `GuardrailCard`, `Button` | Accept button disabled unless backend action says enabled. |
| `worker.wallet.notWired` | `/worker/wallet` | no wallet/ledger user-facing API in current scope | not-wired | disabled `wallet.withdraw`, `wallet.viewLedger` | partial frame: `Worker / Income / Default` | `MetricCard`, `NotWiredState`, `GuardrailCard` | No fake earnings or withdrawal. |

### Admin

| Workflow | Route | Backend source | State | Actions | Figma binding | UI components | Policy |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `admin.settlement.dashboard` | `/admin/` settlement console | settlement contracts and existing admin API | backend read state/loading/error | read/refresh only unless backend action contract enables | `DESIGN_SOURCE_MISSING` for Settlement | `AdminShell`, `MetricCard`, `ApiErrorPanel`, `StateBadge` | Cannot claim Figma exact match. |
| `admin.governance.hash` | `/admin/#/settlement-ops/governance` | governance/hash API and settlement governance contracts | backend hash loaded/error | `governance.refreshHash` | `DESIGN_SOURCE_MISSING` | `AdminToolbar`, `GuardrailCard`, `ScopeBadge` | No execution; preserve errors. |
| `admin.export.review` | `/admin/#/settlement-ops/exports` | settlement export/review contracts | backend export review state | review/navigation actions only if backend says enabled | `DESIGN_SOURCE_MISSING` | `AdminToolbar`, `StateBadge`, `ApiErrorPanel` | No fake download/export execution. |
| `admin.statement.detail` | `/admin/#/settlement-ops/statements/:id` | settlement statement contracts | statement loaded/400/error | read/refresh/audit intent if available | `DESIGN_SOURCE_MISSING` | `Card`, `AdminToolbar`, `StateBadge`, `ApiErrorPanel` | Do not hide backend 400. |
| `admin.error.400` | all admin settlement/governance routes | API error contracts | error response | retry or navigation only | derived design | `ApiErrorPanel`, `GuardrailCard` | Surface status/code/message; do not swallow. |
| `admin.cityScope.guardrail` | all admin routes | `CONTRACT_CITY_CODE.md`, RequestContext contracts | scoped/unscoped/blocked | disabled actions when scope invalid | derived design | `ScopeBadge`, `GuardrailCard`, `AdminToolbar` | `__global__` and missing city scope must not enable scoped actions. |
| `admin.audit.action` | settlement/governance pages | `CONTRACT_SETTLEMENT_ACTION_INTENT.md` | governance draft/review/blocked | only governance intent actions, no money movement | `DESIGN_SOURCE_MISSING` for current routes | `AdminToolbar`, `GuardrailCard`, `StateBadge` | Audit/governance actions require audit trail and phase boundary. |

## Button Enablement Examples

### Customer create order

```json
{
  "actionId": "customer.order.create",
  "labelKey": "customer.order.create.submit",
  "enabled": true,
  "danger": false,
  "confirmRequired": false,
  "endpoint": "/api/orders",
  "method": "POST",
  "idempotencyRequired": true,
  "auditRequired": false
}
```

### Worker accept unavailable

```json
{
  "actionId": "worker.order.accept",
  "labelKey": "worker.task.accept",
  "enabled": false,
  "disabledReasonCode": "WORKFLOW_NOT_IMPLEMENTED",
  "danger": false,
  "confirmRequired": true,
  "idempotencyRequired": true,
  "auditRequired": true
}
```

### Admin governance only

```json
{
  "actionId": "admin.settlement.intent.markGovernanceRisk",
  "labelKey": "admin.settlement.governance.markRisk",
  "enabled": true,
  "danger": false,
  "confirmRequired": true,
  "endpoint": "/api/internal/settlement/action-intents",
  "method": "POST",
  "idempotencyRequired": true,
  "auditRequired": true
}
```

The endpoint above is illustrative until the exact backend route is confirmed. UI implementation must cite the actual backend API before enabling it.

## Phase 15.3F Entry Conditions

Before pixel repair for any route, the route must have:

1. A `workflowName`.
2. A `route`.
3. An `actor`.
4. Cited backend contract docs.
5. A state source.
6. A complete `availableActions` list.
7. Disabled action reasons for all unavailable actions.
8. A Figma binding status.
9. A component mapping to `packages/ui`.
10. A not-wired policy when backend capability is missing.

If any item is missing, the route can receive documentation only, not a high-fidelity implementation claim.

## Verification Rule

Phase 15.3F implementation must verify:

- Figma frame screenshot match for visual routes.
- Backend action availability for every button.
- No fake business data.
- No local-only success state masquerading as backend success.
- Same-origin API only.
- Build/typecheck/test pass.

Production remains NO-GO until separately authorized.
