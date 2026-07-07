# @xlb/ui Component Manifest (Phase 15)

## Purpose

This manifest records UI components that must remain presentation-layer only and not encode business rules.

## Layered responsibility

- Presentational components: render workflow/strategy state, action slots, and themed surfaces.
- Business translation: `WorkflowUiBinding` adapters (in apps).
- No component in `packages/ui` may:
  - invent executable actions,
  - compute permissions/audit/idempotency,
  - call backend APIs directly,
  - branch on workflow semantics beyond display state.

## Registered Components

### Layout / Surface
- `RuntimeThemeSurface`
- `BottomNav`, `ActionDock`
- `SectionHeader`, `Card`, `WorkflowStatePanel`

### Workflow Expression
- `WorkflowTimeline`
- `WorkflowStatePanel`
- `DisabledReasonText`
- `CustomerAnswerCard`
- `WorkerAnswerCard`
- `NotWiredState`

### Data Widgets
- `ServiceCard`
- `CustomerQuoteCard`
- `WorkerStatusCard`
- `WorkerTaskCard`
- `OrderCard`
- `StatCard`
- `AdminToolbar`
- `ScopeBadge`
- `StateBadge`
- `Table`

### Utilities
- `ApiErrorPanel`

## Versioned Boundary

- Business route behavior is owned by app adapters and app pages.
- Theme tokens are owned by token runtime in `packages/ui/tokens` and injected via `ThemeProvider`.
- Any request that extends component behavior to business decisions must be routed through app-layer adapter redesign, not component changes.

## Verification

- `packages/ui` components are allowed to consume `WorkflowUiBinding` fields as display input, but must not mutate or override business meaning.
- All "real device shell", mobile mode behavior, and route orchestration logic belongs outside component internals unless purely layout-only.
