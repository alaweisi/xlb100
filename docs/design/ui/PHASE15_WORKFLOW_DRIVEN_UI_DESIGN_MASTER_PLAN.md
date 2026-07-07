# Phase 15 Workflow-Driven UI Design Master Plan

## Purpose

This master plan defines how XLB100 should implement Figma-based UI while preserving backend workflow truth and design-token-driven runtime theming.

The plan is intentionally architecture-first. It must be used before more UI page code is written.

## Design Architecture

```text
backend contracts
  -> workflow view model
  -> route binding
  -> packages/ui components
  -> Figma visual target
  -> runtime theme tokens
```

The UI must be product-grade, but it must remain honest:

- no fake orders;
- no fake payments;
- no fake worker tasks;
- no fake earnings;
- no fake settlement actions;
- no fake admin execution;
- no Figma-created business actions.

## Three-App Visual Goals

### Customer

Goal: warm, trustworthy, service-ordering mobile experience.

Visual direction:

- 390px mobile-first Figma composition;
- cream/warm surface;
- brown-gold/customer accent;
- rounded elevated service/order cards;
- fixed bottom navigation;
- visible answer cards explaining current step and next action;
- price and payment states must be explicit and backend-driven.

Priority routes:

- `/customer/order/create`
- `/customer/orders`
- `/customer/`
- `/customer/services`
- `/customer/profile`

### Worker

Goal: focused, operational, dark grab-hall experience without fake dispatch data.

Visual direction:

- Figma worker dark blue language;
- grab-hall/radar visual surface where frame exists;
- certification and eligibility guardrails;
- disabled accept actions with backend reason;
- wallet/income not-wired state must stay honest;
- task cards must not fabricate tasks.

Priority routes:

- `/worker/`
- `/worker/tasks`
- `/worker/wallet`
- `/worker/profile`
- `/worker/certification`

### Admin

Goal: dense, clear, auditable operations UI.

Visual direction:

- preserve current Settlement/Governance backend logic;
- show city scope and guardrails clearly;
- show raw 400/error states instead of swallowing them;
- use admin Figma visual language only where source exists;
- mark Settlement/Governance as `DESIGN_SOURCE_MISSING` until frames exist.

Priority routes:

- `/admin/`
- Settlement console
- Governance
- Export Review
- Statement Detail
- Governance hash pages

## Figma Inheritance Rules

1. Use exact Figma frame when route has a matching frame.
2. Use partial Figma frame when route has related but incomplete frame coverage.
3. Use derived design only for visual harmonization.
4. Use `DESIGN_SOURCE_MISSING` when no matching frame exists.
5. Do not claim high fidelity unless browser screenshot has been compared with exported Figma PNG.
6. Do not use Figma PNGs as page backgrounds.
7. Do not change backend workflow to fit a visual mock.

## Page Structure

### Mobile customer/worker page structure

```text
MobileShell
  TopBar / role header
  PageHero or summary area
  Workflow state card
  Primary content cards
  Not-wired / empty / error / loading area when needed
  ActionDock or fixed CTA
  BottomNav
```

### Admin page structure

```text
AdminShell
  SideNav / TopBar
  AdminToolbar
  ScopeBadge / GuardrailCard
  MetricCard row
  Table or detail cards
  ApiErrorPanel / EmptyState / LoadingState
  Audit action area
```

## Component Hierarchy

Shared:

- `ThemeProvider`
- `MobileShell`
- `AdminShell`
- `PageShell`
- `Card`
- `Button`
- `StatusTag`
- `StateBadge`
- `ScopeBadge`
- `GuardrailCard`
- `NotWiredState`
- `ApiErrorPanel`
- `LoadingState`
- `EmptyState`
- `Skeleton`

Customer:

- `ServiceCard`
- `OrderCard`
- `CustomerQuoteCard`
- `CustomerAnswerCard`
- `WorkflowTimeline`
- `PriceText`
- `ActionDock`

Worker:

- `WorkerStatusCard`
- `WorkerTaskCard`
- `WorkOrderCard`
- `MetricCard`
- `GuardrailCard`
- `ActionDock`

Admin:

- `AdminToolbar`
- `MetricCard`
- `ScopeBadge`
- `StateBadge`
- `ApiErrorPanel`
- table/action components

Components must be business-neutral. Business semantics enter through props produced by the app workflow view model.

## State Expression

Each state must render through one of these patterns:

| State | Visual expression | Data source |
| --- | --- | --- |
| loading | `LoadingState` / `Skeleton` | request lifecycle |
| empty | `EmptyState` | backend empty response |
| error | `ApiErrorPanel` | backend/client error |
| disabled | `GuardrailCard` + disabled action | `disabledReasonCode` |
| not-wired | `NotWiredState` | not-wired policy |
| actionable | `ActionDock` / `AdminToolbar` | `availableActions` |
| timeline | `WorkflowTimeline` | backend state |
| city scoped | `ScopeBadge` | RequestContext/API |

## Action Areas

All action areas consume `availableActions`:

- customer fixed bottom CTA;
- customer order/payment action dock;
- worker accept/refresh area;
- worker certification/wallet disabled area;
- admin toolbar actions;
- admin table row actions;
- retry buttons.

Action areas must show:

- enabled/disabled state;
- disabled reason when unavailable;
- confirmation when required;
- danger tone when required;
- audit indication when required;
- city scope indication when required.

## Not-Wired Expression

Not-wired is a real product state, not an embarrassment to hide.

It must include:

- clear Chinese title;
- what is unavailable;
- why it is unavailable;
- what the user can do now;
- no fake data;
- no fake success;
- no hidden disabled action.

Examples:

- customer order list API missing;
- customer profile/account API missing;
- worker wallet API missing;
- worker accept workflow not enabled;
- admin design source missing for Settlement/Governance high-fidelity claim.

## Error / Loading / Empty Expression

Loading:

- skeleton for cards and tables;
- avoid layout shift;
- do not hide primary workflow state if already known.

Empty:

- backend empty data means empty;
- not-wired means not-wired, not empty;
- empty must not fabricate sample cards.

Error:

- backend 400/status/message must be visible where operationally relevant;
- admin must preserve raw failure details;
- retry actions must come from safe action contract.

## packages/ui Component List For Phase 15.3F

Must exist or be added as business-neutral components:

- `ThemeProvider`
- `ActionDock`
- `WorkflowTimeline`
- `CustomerAnswerCard`
- `CustomerQuoteCard`
- `PriceText`
- `ServiceCard`
- `OrderCard`
- `WorkerStatusCard`
- `WorkerTaskCard`
- `WorkOrderCard`
- `AdminToolbar`
- `GuardrailCard`
- `ScopeBadge`
- `StateBadge`
- `NotWiredState`
- `ApiErrorPanel`
- `LoadingState`
- `EmptyState`
- `MetricCard`
- `MobileShell`
- `AdminShell`
- `BottomNav`

Any missing component must be added to `packages/ui` in a later code phase only after route mapping is complete.

## Theme / Tokens Rules

Theme is visual-only.

Token groups:

- semantic color tokens;
- role tokens;
- component tokens;
- asset tokens;
- spacing/radius/shadow tokens;
- motion/density tokens;
- safe-area tokens.

Rules:

- default theme is mandatory fallback;
- all role/city/campaign/festival themes inherit from default;
- app pages do not hardcode festival colors;
- campaign theme cannot enable business workflow;
- theme cannot hide backend errors;
- theme cannot alter city scope;
- theme cannot modify payment/dispatch/settlement/refund permissions.

## Runtime Theming Flow

```text
resolve activeTheme
  -> validate theme config
  -> merge with default theme
  -> expose CSS variables/component tokens
  -> render packages/ui components
  -> bind workflow state/actions from app view model
```

Future `activeTheme` may come from:

- default fallback;
- city config;
- admin config;
- remote config.

All sources must remain visual-only.

## Pixel Repair Order

Recommended Phase 15.3F order:

1. Build route workflow/action/theme checklist.
2. Repair `packages/ui` token/theme foundations.
3. Repair `/customer/order/create` against Figma CreateOrder.
4. Repair `/customer/orders` against Orders and OrderDetail frames.
5. Repair `/customer/` and `/customer/services`.
6. Repair `/worker/` against GrabHall Online/Paused.
7. Repair `/worker/tasks`, `/worker/wallet`, `/worker/profile`, `/worker/certification` with not-wired honesty.
8. Admin: preserve Settlement/Governance business logic; harmonize visually only as derived design unless new Figma frames are supplied.
9. Capture browser screenshots.
10. Compare against Figma PNGs.
11. Run build/typecheck/test.
12. Deploy staging only after explicit instruction.

## Phase 15.3F Entry Gate

No route may enter Pixel Repair Implementation until it has:

- route mapping;
- Figma binding status;
- workflow name;
- backend source;
- state source;
- action contract list;
- answer model;
- not-wired policy if needed;
- packages/ui components;
- runtime theme tokens;
- screenshot comparison plan.

Routes without this checklist can be audited or documented only.

## Production Boundary

This master plan does not authorize production deployment, tag creation, backend changes, db changes, or app code changes.

Production remains NO-GO.
