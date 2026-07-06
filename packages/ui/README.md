# @xlb/ui

Shared Phase 15.1 UI primitives and shells for XLB frontends.

## Exports

- Tokens: `tokens`
- Primitives: `Button`, `Card`, `Input`, `Select`, `Textarea`, `FormField`
- Search/filter: `SearchBar`, `Tabs`, `SegmentedControl`
- Status/display: `Badge`, `StatusTag`, `Table`, `Timeline`, `PriceText`, `StatCard`
- Product cards: `ServiceCard`, `OrderCard`, `WorkOrderCard`, `WorkerTaskCard`
- Feedback: `Modal`, `Drawer`, `BottomSheet`, `Toast`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`
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
