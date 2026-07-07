# @xlb/ui Component Manifest (Phase 15.3V - Structure Landing)

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

### Primitives
- `packages/ui/src/components/primitives/`
- Rendering atoms and generic controls (`Button`, `Card`, `Badge`, `Input`, `Select`, `Textarea`, ...).
- No business imports. No API imports.

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
