# @xlb/ui

Shared Phase 15.1 UI primitives and shells for XLB frontends.

## Exports

- Tokens: `tokens`
- Primitives: `Button`, `Card`, `Input`, `Select`, `Textarea`, `FormField`
- Status/display: `Badge`, `StatusTag`, `Table`, `Timeline`, `PriceText`
- Feedback: `Modal`, `Drawer`, `Toast`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`
- Shells/navigation: `PageShell`, `MobileShell`, `AdminShell`, `BottomNav`, `TopBar`, `SideNav`

## Boundary

This package contains reusable UI materials only. It does not call business APIs, does not own app routes, does not provide fake business data, and does not replace Figma-approved page design. Customer, worker, and admin pages must compose these primitives according to the approved product design and real API contracts.
