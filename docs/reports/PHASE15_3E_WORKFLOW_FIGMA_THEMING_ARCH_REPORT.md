# Phase 15.3E-ARCH - Workflow-driven Figma UI Design Architecture Report

## Executive Summary

Phase 15 UI implementation must be driven by backend workflow contracts, visually shaped by Figma, rendered through `packages/ui`, and themed through design-token-driven runtime theming.

This report records the architecture needed before continuing Figma Pixel Repair.

## Files Changed

- `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
- `docs/contracts/CONTRACT_RUNTIME_THEMING_TOKENS.md`
- `docs/design/ui/PHASE15_WORKFLOW_DRIVEN_UI_DESIGN_MASTER_PLAN.md`
- `docs/reports/PHASE15_3E_WORKFLOW_FIGMA_THEMING_ARCH_REPORT.md`
- `docs/execution/PHASE15_PROGRESS.md`

No `apps/**`, `packages/**`, backend, db, deploy, infra, production env, or tag changes were made.

## Architecture Decision

The approved direction is:

```text
backend workflow decides behavior
Figma decides visual expression
packages/ui renders reusable components and tokens
apps bind API/workflow view models to UI slots
runtime theme changes visual tokens only
```

The rejected direction is:

```text
Figma layer/button decides business action
frontend page invents enabled state
theme/campaign changes business logic
UI component calls backend workflow directly
```

## Contract Updates

`CONTRACT_WORKFLOW_UI_BINDING.md` now defines:

- `WorkflowUiBinding`
- `ActionContract`
- `DisabledReasonCode`
- `CustomerAnswerModel`
- `WorkerAnswerModel`
- `AdminGovernanceModel`
- `FigmaBinding`
- `UiSlot`
- `NotWiredPolicy`
- `RuntimeThemeScope`
- C/W/A route binding tables
- Phase 15.3F entry conditions

The `ActionContract` now includes `cityScopeRequired`.

## Runtime Theming Contract

`CONTRACT_RUNTIME_THEMING_TOKENS.md` defines:

- default theme
- theme inheritance
- semantic tokens
- component tokens
- asset tokens
- city/campaign/festival overrides
- fallback strategy
- activeTheme future control by cityConfig/adminConfig/remoteConfig
- strict visual-only theme boundary

Critical rule:

Theme may change visual expression, but it must not affect backend workflow state, endpoint, permission, audit, idempotency, order, payment, dispatch, settlement, refund, or city scope.

## UI Master Plan

`PHASE15_WORKFLOW_DRIVEN_UI_DESIGN_MASTER_PLAN.md` defines:

- three-app visual goals
- Figma inheritance rules
- page structures
- component hierarchy
- state expression
- action area rules
- not-wired expression
- error/loading/empty expression
- `packages/ui` component list
- theme/tokens rules
- Pixel Repair order

## Route Coverage

Customer routes covered:

- `/customer/`
- `/customer/services`
- `/customer/order/create`
- `/customer/orders`
- `/customer/profile`

Worker routes covered:

- `/worker/`
- `/worker/tasks`
- `/worker/wallet`
- `/worker/profile`
- `/worker/certification`

Admin routes covered:

- `/admin/`
- Settlement console
- Governance
- Export Review
- Statement Detail
- Governance hash pages
- 400/error state
- city_scope guardrail
- audit action

## Figma Binding Decision

Every route must be marked:

- `exact frame`
- `partial frame`
- `derived design`
- `DESIGN_SOURCE_MISSING`

Current important limitation:

Admin Settlement/Governance/Export Review/Statement Detail/Governance hash pages are `DESIGN_SOURCE_MISSING` for high-fidelity claims. They may be visually harmonized only as derived/admin-operational UI unless matching Figma frames are supplied.

## Worker/Admin Answer Models

The architecture now requires Worker pages to answer:

- whether the worker can accept orders;
- service city;
- certification status;
- why acceptance is blocked;
- next step;
- whether income/wallet is truly wired.

Admin pages must answer:

- current city scope;
- whether the state is actionable;
- audit requirement;
- second confirmation requirement;
- raw failure visibility;
- design source missing status.

## Phase 15.3F Entry Gate

Pixel Repair Implementation must not start for a route until it has:

- workflow mapping;
- Figma binding;
- UI slot mapping;
- `packages/ui` component mapping;
- runtime theme token mapping;
- action contract list;
- disabled reason policy;
- answer model;
- not-wired policy when needed;
- screenshot comparison plan.

This prevents high-fidelity visual work from drifting into fake business behavior.

## Verification

Required verification for this architecture phase:

- `git status --short`
- `git rev-parse HEAD`
- scope check: only docs/contracts, docs/design/ui, docs/reports, docs/execution changed
- no deploy
- no tag

## Recommendation

Proceed next to a route-by-route Phase 15.3F checklist before code edits.

Recommended first Pixel Repair implementation targets after checklist completion:

1. `/customer/order/create`
2. `/customer/orders`
3. `/worker/`

Admin Settlement/Governance should remain visually derived unless dedicated Figma frames are provided.
