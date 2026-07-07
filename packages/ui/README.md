# @xlb/ui

Shared Phase 15.1 UI primitives and shells for XLB frontends.

## Exports

- Tokens: `tokens`
- Primitives: `Button`, `Card`, `Input`, `Select`, `Textarea`, `FormField`
- Search/filter: `SearchBar`, `Tabs`, `SegmentedControl`
- Status/display: `Badge`, `StatusTag`, `StateBadge`, `ScopeBadge`, `Table`, `Timeline`, `PriceText`, `StatCard`, `MetricCard`
- Product cards: `ServiceCard`, `OrderCard`, `WorkOrderCard`, `WorkerTaskCard`
- Product variants: `HeroCard`, `GuardrailCard`, `CustomerQuoteCard`, `WorkerStatusCard`, `AdminToolbar`
- Workflow expression: `ActionDock`, `WorkflowTimeline`, `WorkflowStatePanel`, `DisabledReasonText`, `CustomerAnswerCard`, `WorkerAnswerCard`, `RuntimeThemeSurface`
- Feedback: `Modal`, `Drawer`, `BottomSheet`, `Toast`, `EmptyState`, `ErrorState`, `ApiErrorPanel`, `NotWiredState`, `LoadingState`, `Skeleton`
- Shells/navigation: `PageShell`, `MobileShell`, `AdminShell`, `BottomNav`, `TopBar`, `SideNav`

## Boundary

This package contains reusable UI materials only. It does not call business APIs, does not own app routes, does not provide fake business data, and does not replace Figma-approved page design. Customer, worker, and admin pages must compose these primitives according to the approved product design and real API contracts.

Phase 15.1B added route-shell gap components required by the Figma/Codex Design plan:

- `SearchBar` is a controlled search form with `value`, `placeholder`, `onChange`, optional `onSubmit`, `disabled`, and `leadingIcon`.
- `Tabs` / `SegmentedControl` render business-agnostic status or category switches with `items`, `activeKey`, `onChange`, and `density`.
- `BottomSheet` provides a mobile-first light overlay with `open`, `onClose`, `title`, `children`, and `footer`.
- `StatCard` renders label/value/hint/trend summaries without owning metric semantics.
- `ServiceCard`, `OrderCard`, and `WorkOrderCard` provide generic card shells for app pages. They do not include service catalogs, order state machines, task APIs, settlement logic, or mock data.

`SettlementCard` is intentionally deferred to Phase 15.5 so it can be shaped against existing admin Settlement pages and governance constraints.

Phase 15.3B adds visual-only shell extension points for Figma productization:

- `MobileShell` supports `style` and `contentStyle` for role-specific mobile containers.
- `AdminShell` supports `style` and `contentStyle` for desktop operational density.
- `TopBar` supports `subtitle` and `style`.
- `BottomNav` and `SideNav` support `style`.

These props do not change data ownership. App pages still own API state, routes, and not-wired messaging.

Phase 15.3C adds zh-CN visual refinement components for the three-app Figma pass:

- `HeroCard` provides role-colored customer/worker/admin entry cards through `productRole`; it does not contain route or API logic.
- `MetricCard` refines `StatCard` for dashboard-like summaries while leaving metric semantics to app pages.
- `GuardrailCard`, `AdminToolbar`, `ScopeBadge`, and `StateBadge` support admin operation density, city-scope visibility, and guarded workflow status.
- `NotWiredState` is the explicit state for capabilities that are not connected to real APIs; it must not be replaced with fake success content.
- `ApiErrorPanel` keeps API error detail visible without swallowing backend errors.
- `CustomerQuoteCard` presents a real quote payload supplied by the app; it does not calculate prices.
- `WorkerStatusCard` presents worker-side empty/not-wired boundaries; it must not create sample tasks, earnings, credentials, or online state.

Phase 15.3F-0 adds workflow expression components:

- `ActionDock` renders `WorkflowActionContract` actions supplied by app adapters. It does not decide whether an action is enabled.
- `WorkflowStatePanel` summarizes route workflow source, state, disabled reason, and Figma binding.
- `WorkflowTimeline` renders typed workflow timeline items without owning business transitions.
- `DisabledReasonText` translates disabled reason codes for visible UI explanation.
- `CustomerAnswerCard` and `WorkerAnswerCard` render answer models produced by app workflow adapters.
- `RuntimeThemeSurface` marks visual-only theme scope and never changes workflow behavior.
