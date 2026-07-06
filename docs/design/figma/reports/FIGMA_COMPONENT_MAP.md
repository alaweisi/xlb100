# Phase 15.0C Figma Component Map

## Summary

Figma contains a visible component inventory but no formal local Figma components or component sets in the scanned file. Mapping therefore uses visible design component names and the current `@xlb/ui` Phase 15.1 exports.

## Covered By `@xlb/ui`

| Figma / Required Concept | `@xlb/ui` Export | Status |
| --- | --- | --- |
| Button | `Button` | Covered, but loading/pressed variants need implementation detail review. |
| Card | `Card` | Covered as primitive container. |
| StatusTag | `StatusTag` / `Badge` | Covered. |
| Dialog | `Modal` | Covered as web modal mapping. |
| Toast | `Toast` | Covered. |
| Empty | `EmptyState` | Covered. |
| Loading | `LoadingState` / `Skeleton` | Covered at primitive level. |
| Error | `ErrorState` | Covered. |
| BottomNavigation | `BottomNav` | Covered. |
| TopBar | `TopBar` | Covered. |
| Page shell | `PageShell`, `MobileShell`, `AdminShell` | Covered at shell level. |

## Gaps Before Phase 15.2

| Gap | Reason |
| --- | --- |
| `SearchBar` | Figma inventory explicitly includes SearchBar; `@xlb/ui` has Input but no search-specific composition. |
| `Tabs` / segmented filters | Customer services and admin/worker filters need tab-like controls; not currently exported. |
| `BottomSheet` | Worker order detail and grab confirmation use bottom-sheet behavior; Drawer is not an exact mobile sheet. |
| `StatCard` | Admin dashboard and worker income screens use metric cards. |
| `OrderCard` | Customer order list/detail and component inventory require role-aware order cards. |
| `WorkOrderCard` / `WorkerTaskCard` | Worker grab hall and admin work-order pool need operational cards. |
| `ServiceCard` | Customer service catalog needs service category/item cards. |
| `SettlementCard` | Required by execution checklist, not detected in this Figma snapshot; keep as later admin settlement UI gap. |

## Implementation Guidance

- Phase 15.2 should compose pages with existing `MobileShell`, `TopBar`, `BottomNav`, `Card`, states, and buttons first.
- Add missing components only when a page needs them; do not build a broad speculative component library.
- Keep role colors tokenized through CSS variables before app page rollout.
- Do not convert visible Figma demo values into fake business success data; use real API states or honest empty/error states.
