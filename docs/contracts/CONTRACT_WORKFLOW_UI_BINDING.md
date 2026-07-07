# CONTRACT_WORKFLOW_UI_BINDING

## Purpose

This contract defines the binding layer between backend workflows, Figma design, `packages/ui`, and app route implementation for Phase 15.

Core architecture:

```text
backend workflow/API contract
  -> app workflow view model
  -> packages/ui slots/components
  -> Figma visual expression
  -> runtime theme tokens
```

Figma controls the visual shape. Backend workflow controls business truth. `packages/ui` carries reusable components and tokens. App packages only assemble routes, call APIs, and adapt workflow view models.

## Hard Rules

1. Backend workflows decide state, permissions, `availableActions`, disabled reasons, audit requirements, idempotency, and city scope.
2. Frontend apps must not invent business buttons, fake workflow states, bypass backend logic, or enable actions from local visual assumptions.
3. Figma decides layout, hierarchy, density, visual tone, spacing, and interaction expression, but it does not decide business actions.
4. `packages/ui` renders components, slots, tokens, theme surfaces, state panels, action areas, and badges.
5. `packages/ui` must not import `@xlb/api-client`, call business APIs, mutate workflow state, or decide backend permissions.
6. `apps/customer`, `apps/worker`, and `apps/admin` perform page assembly, API wiring, and workflow view model adaptation only.
7. Runtime visual changes must flow through design tokens and active theme, never page-level hardcoded festival/campaign colors.
8. Theme changes must not affect order, payment, dispatch, settlement, refund, audit, permission, or city scope logic.
9. Any route without a backend workflow/API must render `not-wired`, read-only, disabled action, or guardrail state.
10. Any route without a matching Figma frame must be marked `DESIGN_SOURCE_MISSING`.

## Workflow UI Binding Contract

```ts
type Actor = "customer" | "worker" | "admin";

type BackendSource = {
  contractDocs: string[];
  endpoints: string[];
  modules?: string[];
  status: "wired" | "partial" | "not-wired" | "read-only" | "design-source-missing";
};

type WorkflowStateSource =
  | "backend"
  | "api-contract"
  | "frontend-derived-from-api"
  | "not-wired-policy";

type WorkflowState = {
  stateId: string;
  source: WorkflowStateSource;
  terminal?: boolean;
  customerAnswer?: CustomerAnswerModel;
  workerAnswer?: WorkerAnswerModel;
  adminGovernance?: AdminGovernanceModel;
};

type WorkflowUiBinding = {
  workflowName: string;
  actor: Actor;
  route: string;
  backendSource: BackendSource;
  state: WorkflowState;
  availableActions: ActionContract[];
  disabledReasonCode?: DisabledReasonCode;
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
  runtimeThemeScope?: RuntimeThemeScope;
};
```

Required fields:

| Field | Rule |
| --- | --- |
| `workflowName` | Stable workflow identifier, for example `customer.order.create`. |
| `actor` | Must be `customer`, `worker`, or `admin`. |
| `route` | Browser route or route pattern. |
| `backendSource` | Must cite backend contract docs and endpoints. If missing, mark `not-wired`. |
| `state` | Must come from backend/API/not-wired policy, not Figma. |
| `availableActions` | The only source of executable or disabled business buttons. |
| `disabledReasonCode` | Required when route state or an action is blocked. |
| `customerFacingCopy` | Copy scope or copy keys rendered by app layer. |
| `uiSlots` | Slots where workflow state and actions bind into visual layout. |
| `figmaFrame` | Must be exact, partial, derived, or missing. |
| `packagesUiComponents` | Shared presentation components. |
| `notWiredPolicy` | Required when a backend capability is absent. |
| `runtimeThemeScope` | Optional visual theme scope. Must not change workflow behavior. |

## Action Contract

All functional buttons, toolbar actions, bottom CTA actions, and table row actions must use this shape:

```ts
type ActionContract = {
  actionId: string;
  labelKey: string;
  enabled: boolean;
  disabledReasonCode?: DisabledReasonCode;
  danger: boolean;
  confirmRequired: boolean;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  idempotencyRequired: boolean;
  auditRequired: boolean;
  cityScopeRequired: boolean;
};
```

Field rules:

| Field | Rule |
| --- | --- |
| `actionId` | Stable backend/workflow action ID. It must not be a Figma layer name. |
| `labelKey` | Localizable label key. Copy may vary, semantics may not. |
| `enabled` | Backend/API/not-wired-derived only. |
| `disabledReasonCode` | Required when `enabled=false`. |
| `danger` | Required for destructive, irreversible, payment, dispatch, settlement, refund, audit, or admin mutation actions. |
| `confirmRequired` | Required for money movement, audit, irreversible, destructive, or governance-affecting actions. |
| `endpoint` | Required for executable backend actions. Omit only for navigation/read-only/not-wired display actions. |
| `method` | Required when `endpoint` exists. |
| `idempotencyRequired` | Required for create, retryable mutation, payment, audit, settlement, dispatch, and acceptance actions. |
| `auditRequired` | Required for admin, settlement, governance, payment, dispatch, worker acceptance, refund, and permission actions. |
| `cityScopeRequired` | Required for all city-scoped business workflows. |

Forbidden:

- Enabling a button because Figma visually shows it as primary.
- Calling an endpoint without `actionId`.
- Hiding a disabled reason.
- Making `packages/ui` decide business permissions.
- Enabling settlement, audit, dispatch, payment, refund, or worker accept without backend contract support.

## Disabled Reason Codes

```ts
type DisabledReasonCode =
  | "API_NOT_AVAILABLE"
  | "WORKFLOW_NOT_IMPLEMENTED"
  | "DESIGN_SOURCE_MISSING"
  | "PHASE_BOUNDARY"
  | "CITY_SCOPE_REQUIRED"
  | "IDENTITY_REQUIRED"
  | "AUDIT_REQUIRED"
  | "EXECUTION_DISABLED"
  | "PERMISSION_DENIED"
  | "STATE_NOT_ACTIONABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "BACKEND_ERROR";
```

Apps may translate these into Chinese copy, but may not change the reason semantics.

## Customer Answer Model

Every customer workflow state must answer:

```ts
type CustomerAnswerModel = {
  currentStep: string;        // 当前在哪一步
  nextAvailableStep: string;  // 下一步能做什么
  blockedReason?: string;     // 为什么不能做
  estimatedTime?: string;     // 大概多久
  recoveryPath?: string;      // 出问题怎么办
};
```

Rules:

- `currentStep` comes from catalog/pricing/order/payment/backend state or explicit not-wired policy.
- `nextAvailableStep` comes from `availableActions`.
- `blockedReason` comes from `disabledReasonCode`.
- `estimatedTime` must be backend/SLA-derived; if unknown, show unknown or omit.
- `recoveryPath` must be retry, refresh, contact support, or not-wired explanation.

Customer UI must not claim:

- payment success without backend payment/order state;
- dispatch without dispatch workflow;
- worker acceptance without worker/dispatch workflow;
- profile/address/account data when API is missing.

## Worker Answer Model

Every worker workflow state must answer:

```ts
type WorkerAnswerModel = {
  canAcceptOrder: boolean;       // 当前是否可接单
  serviceCity?: string;          // 服务城市是什么
  certificationPassed?: boolean; // 资质是否通过
  blockedReason?: string;        // 为什么不能接
  nextStep: string;              // 下一步怎么做
  walletWired: boolean;          // 收入/钱包是否真实接线
};
```

Rules:

- `canAcceptOrder` must come from backend worker eligibility/task/accept workflow.
- `serviceCity` must come from request context or worker binding API.
- `certificationPassed` must come from backend certification/qualification state.
- `blockedReason` must map to `disabledReasonCode`.
- `walletWired=false` must render not-wired or read-only state, never fake balance.
- Worker pages must not create fake tasks, fake earnings, fake qualification, fake online state, or fake acceptance.

## Admin Governance Model

Every admin operation must answer:

```ts
type AdminGovernanceModel = {
  cityScope: string;              // 当前 city_scope 是什么
  actionable: boolean;            // 当前状态是否可操作
  auditRequired: boolean;         // 是否需要审计
  confirmRequired: boolean;       // 是否需要二次确认
  rawFailureVisible: boolean;     // 失败原因是否原样展示
  designSourceMissing: boolean;   // 是否存在 DESIGN_SOURCE_MISSING
};
```

Rules:

- `cityScope` must come from RequestContext/API response, not page state.
- `actionable` must come from backend workflow/action availability.
- `auditRequired` and `confirmRequired` must mirror `ActionContract`.
- `rawFailureVisible=true` is required for backend 400/scope/governance failures.
- Settlement/Governance routes remain `DESIGN_SOURCE_MISSING` until dedicated Figma frames exist.
- Admin UI must not swallow 400 errors, city scope guardrail failures, or governance hash errors.

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

| Status | Meaning | High-fidelity claim |
| --- | --- | --- |
| `exact frame` | Direct route frame exists and screenshot repair can target it. | Allowed only after browser screenshot comparison passes. |
| `partial frame` | Related frame exists but route/state is incomplete. | Not a full-route high-fidelity claim. |
| `derived design` | Uses role-level Figma visual language without direct route frame. | Not high-fidelity. |
| `DESIGN_SOURCE_MISSING` | No matching Figma frame exists. | Never high-fidelity. |

### Customer Route Binding

| Route | Workflow | Figma binding | Backend binding |
| --- | --- | --- | --- |
| `/customer/` | `customer.catalog.browsing` | `partial frame`: Customer Home | `GET /api/catalog` |
| `/customer/services` | `customer.catalog.browsing` | `partial frame`: Customer Services | `GET /api/catalog` |
| `/customer/order/create` | `customer.order.create`, `customer.pricing.quote` | `exact frame` candidate: Customer CreateOrder | `GET /api/pricing/quote`, `POST /api/orders`, `POST /api/payments/orders` |
| `/customer/orders` | `customer.order.list.notWired`, `customer.order.detail` | `partial frame`: Orders All/Empty/Detail | list API not wired; detail uses `GET /api/orders/:orderId` |
| `/customer/profile` | `customer.profile.notWired` | `partial frame`: Customer Mine | profile/account/address APIs not wired |

### Worker Route Binding

| Route | Workflow | Figma binding | Backend binding |
| --- | --- | --- | --- |
| `/worker/` | `worker.taskPool.notWired`, `worker.acceptOrder.unavailable` | `exact frame` candidate: Worker GrabHall Online/Paused | task pool read-only if wired; accept unavailable unless backend enables |
| `/worker/tasks` | `worker.taskPool.notWired` | `partial frame`: Worker Tasks/TaskDetail | no fake task list; backend task pool only if available |
| `/worker/wallet` | `worker.wallet.notWired` | `partial frame`: Worker Income | wallet/income API not wired |
| `/worker/profile` | `worker.profile.read`, `worker.certification.status` | `partial frame`: Worker Mine | profile/certification partial/not-wired |
| `/worker/certification` | `worker.certification.status` | `partial frame`: Worker certification surface | certification API only if available |

### Admin Route Binding

| Route | Workflow | Figma binding | Backend binding |
| --- | --- | --- | --- |
| `/admin/` | `admin.settlement.dashboard` or future `admin.dashboard` | Settlement route is `DESIGN_SOURCE_MISSING`; future dashboard frame exists separately | existing internal settlement APIs |
| Settlement Ops | `admin.settlement.dashboard` | `DESIGN_SOURCE_MISSING` | settlement internal APIs |
| Governance | `admin.governance.hash` | `DESIGN_SOURCE_MISSING` | governance/hash API |
| Export Review | `admin.export.review` | `DESIGN_SOURCE_MISSING` | settlement export/review APIs |
| Statement Detail | `admin.statement.detail` | `DESIGN_SOURCE_MISSING` | statement detail API |
| Governance hash pages | `admin.governance.hash` | `DESIGN_SOURCE_MISSING` | governance hash API |
| 400/error state | `admin.error.400` | `derived design` | raw backend error |
| city_scope guardrail | `admin.cityScope.guardrail` | `derived design` | RequestContext/city scope |
| audit action | `admin.audit.action` | `DESIGN_SOURCE_MISSING` for current settlement/governance routes | governance-only action contract |

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
  | "bottomNav"
  | "themeSurface";
```

| Workflow data | UI slot | Component direction |
| --- | --- | --- |
| `availableActions` | `primaryActionDock`, `adminToolbar`, `tableActions` | `ActionDock`, `AdminToolbar`, `Button` |
| order/workflow state | `workflowTimeline`, `stateBadge` | `WorkflowTimeline`, `StateBadge`, `StatusTag` |
| disabled reason | `guardrail` | `GuardrailCard` |
| pending payment | `summaryCard`, `primaryActionDock` | `CustomerAnswerCard`, `CustomerQuoteCard` |
| not-wired capability | `notWired` | `NotWiredState` |
| API error | `apiError` | `ApiErrorPanel`, `ErrorState` |
| city scope | `stateBadge`, `guardrail` | `ScopeBadge`, `GuardrailCard` |
| active theme | `themeSurface` | `ThemeProvider`, shell/card/button tokens |

## Not-Wired Policy

```ts
type NotWiredPolicy = {
  reasonCode: DisabledReasonCode;
  userCopy: string;
  allowedUi: "empty" | "read-only-shell" | "disabled-action" | "guardrail";
  forbiddenClaims: string[];
  allowedActions: ActionContract[];
};
```

Not-wired UI must be explicit, productized, and honest. It may be visually aligned to Figma, but must not imply the workflow is complete.

## Runtime Theme Scope

```ts
type RuntimeThemeScope = {
  activeThemeId: string;
  source: "default" | "cityConfig" | "adminConfig" | "remoteConfig" | "localFallback";
  affects: "visual-only";
};
```

Theme may affect color, typography, spacing, radius, shadow, motion, assets, and component variants. It must not affect workflow action availability, endpoint selection, city scope, permissions, idempotency, audit, or backend state transitions.

## Phase 15.3F Entry Conditions

Pixel Repair Implementation cannot start for a route until the route has:

1. `workflowName`
2. actor
3. route
4. backend contract source
5. state source
6. complete `availableActions`
7. disabled reason mapping
8. Customer/Worker/Admin answer model when applicable
9. Figma binding status
10. packages/ui component mapping
11. runtime theme/token mapping
12. not-wired policy if backend capability is missing
13. screenshot comparison plan

If any item is missing, the route may only be audited or documented. It must not be claimed as high-fidelity implementation.

## Verification Rule

Phase 15.3F implementation must verify:

- Figma frame screenshot match for target routes.
- Backend action availability for every functional button.
- No fake business data.
- No local-only success state masquerading as backend success.
- Same-origin API only.
- Theme switching remains visual-only.
- Build/typecheck/test pass.

Production remains NO-GO until separately authorized.
