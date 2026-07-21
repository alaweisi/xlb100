# XLB100 Frontend UI Implementation Playbook

## Page Construction Formula

Every production-facing page is assembled from four inputs:

| input | responsibility |
| --- | --- |
| `WorkflowUiBinding` | workflow state, backend source, available actions, disabled reasons, audit/idempotency/city-scope flags |
| Selected role visual authority + page card | layout, hierarchy, density, visual intent and route inheritance; Customer Home uses `CUSTOMER_HOME_VISUAL_TRUTH.md` |
| Runtime Theme Tokens | visual skin through CSS variables |
| `packages/ui` components | reusable rendering primitives and workflow expression components |

## Hard Data-to-UI Layer Rule

- `apps/*` 的 adapter 是唯一业务翻译层。
- adapter 负责把后端 workflow / contract 信息映射为页面可消费的 `WorkflowUiBinding`。
- 页面与组件不得直接发明按钮/禁用原因/权限分支，也不得把 not-wired 状态作为可执行动作。

## Source Of Truth Rules

- Business actions come from workflow binding and backend API facts.
- The selected role visual authority decides layout and visual expression. For Customer Home, the only source is `docs/design/ui/references/customer-home-visual-truth.png`; historical Figma frames do not authorize Customer visuals or business actions.
- Customer route carriers and child slices follow `docs/design/ui/CUSTOMER_FULL_BUSINESS_SLICE_VISUAL_REFACTOR_SCOPE.md`; inheriting the Home language never means copying the Home layout.
- Customer full-slice construction follows `docs/design/ui/CUSTOMER_UI_REFACTOR_ENGINEERING_TOPOLOGY.md`; phase order is serial, while a phase may use at most three non-overlapping writer worktrees.
- Campaign decides the active visual theme. It does not alter workflow state or business process.
- `packages/ui` renders components, tokens, and CSS variables only.
- App route code adapts backend/API facts into workflow view models and passes visual tokens into the UI layer.

## ThemeProvider Rule

- `ThemeProvider` must not request backend data.
- `ThemeProvider` must not read `city_code` or parse dates.
- `ThemeProvider` must only merge `default + active override` into CSS variables and keep runtime safe fallback.
- `ThemeProvider` must not introduce business logic.

## Customer-Facing Language

User-facing screens must speak product language. They must not show engineering words such as `not-wired`, `partial`, `api-derived`, `backendSource`, or `DESIGN_SOURCE_MISSING`.

Engineering facts may appear only in a folded UAT panel and only in staging/dev builds. Allowed UAT facts include `city_code`, `skuId`, quote payload/response, create order payload, `orderId`, `paymentOrderId`, order detail response, workflow state, `availableActions`, and disabled reason.

## Runtime Theme Method

- Default theme is always available and safe.
- Activity themes are partial token overrides.
- Page code must consume CSS variables or `packages/ui` components rather than hardcoding activity colors.
- Theme changes must not affect order, payment, dispatch, settlement, refund, permissions, audit, city scope, or idempotency.
- `useActiveCampaignTheme` must not live in `packages/ui`; it belongs in a future app-level theme bridge or API-client injection layer.

## Phase 15 Guardrails

- Customer and Worker may continue constrained Pixel Repair only after workflow/action adapters are present.
- Admin Settlement/Governance remains blocked for exact Pixel Repair while Figma source is missing.
- Campaign architecture may provide visual token support, but backend Campaign API and Admin Campaign management are deferred to Phase 15.3T-IMPL.
