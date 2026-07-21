# @xlb/ui Component Manifest (Customer UI A1 - Shared Design System)

## Scope and Principle

This manifest records the package-level presentation surface after five-layer structure landing.

- `packages/ui` hosts **tokens**, **primitives**, **patterns**, and **templates**.
- App behavior, route orchestration, api-client calls and adapters stay outside components.
- No UI package component may call backend APIs or embed backend-driven decisions.
- `WorkflowUiBinding` is a view model contract: components render from it, not compute it.

## Layer Contract

### Tokens
- `packages/ui/src/tokens/`
- Base token values, theme overrides, `ThemeProvider`, `themeRegistry`, and token types.
- The canonical Customer component recipe is `customerComponentRecipe`. It only
  references `--xlb-role-customer-component-*` variables; literal values remain
  in the token source and CSS handoff file.

### Primitives
- `packages/ui/src/components/primitives/`
- Rendering atoms and generic controls (`Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, ...).
- No business imports. No API imports.
- Shared controls keep `productRole="neutral"` as the compatibility default.
  Customer slices opt in with `productRole="customer"` to inherit the homepage
  language without copying its layout.
- Customer controls provide at least 44px touch targets, protected focus-visible
  treatment and reduced-motion/high-contrast/no-backdrop-filter fallbacks.

### Patterns
- `packages/ui/src/components/patterns/`
- Business-facing display widgets built from props:
  - `PromoBanner`
  - `OrderStatusBadge`
  - `ServiceDiscoveryCard`
  - `CustomerQuoteCard`
  - `WorkerKpiCard`
  - `NotWiredState`
  - `ApiErrorPanel`
  - `CustomerAnswerCard`
  - `WorkerAnswerCard`
  - `RuntimeThemeSurface`
  - `WorkflowTimeline`
  - `WorkflowStatePanel`
- No network calls.

### Templates
- `packages/ui/src/templates/`
- Structural page shells that compose primitives/patterns:
  - `CustomerHomeTemplate`
  - `CustomerServicesTemplate`
  - `CustomerOrderCreateTemplate`
  - `CustomerOrdersTemplate`
  - `CustomerProfileTemplate`
  - `WorkerGrabHallTemplate`

### Page Routes
- Routing and stateful orchestration remain in `apps/customer/src/pages/` and `apps/customer/src/app/App.tsx`.

## API and Workflow Rule

- `packages/ui` may consume:
  - `WorkflowUiBinding`
  - View model props from adapters
  - Runtime theme bindings
- `packages/ui` must not:
  - create business actions
  - decide audit/permissions/idempotency/dispatch/policy state
  - request backend data

## Registry Alignment

- Registered components in this phase are aligned with exports in `packages/ui/src/index.ts` and layer directories.
- Storybook is not wired yet; manifest defines the contract for future Storybook/contract-mock coverage.

## Customer A1 State and Overlay Contract

- `LoadingState`, `EmptyState`, and `ErrorState` expose persistent status/alert
  regions and support recovery actions without changing business behavior.
- `Modal`, `Drawer`, and `BottomSheet` share dialog semantics, initial focus,
  focus trapping, optional Escape/scrim close, and focus restoration.
- Overlay surfaces use the Customer glass recipe when opted in and retain a
  solid fallback when blur or contrast capabilities are unavailable.
- App shell composition, page orchestration and route-level state integration
  remain outside this A1 package boundary.
