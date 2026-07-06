# Phase 15.0D Codex Design Optimization Report

## Result

Phase 15.0D completed a Codex Design render optimization pass based on:

- Figma MCP snapshot in `docs/design/figma/`.
- Phase 15.0C intake, component map, and render optimization plan.
- Current Phase 15.1 `@xlb/ui` exports.

No app page was implemented. No `packages/ui` code was modified. Production remains NO-GO.

## Figma Draft Strengths

- Clear role split across customer, worker, and admin.
- Complete mobile-first page coverage for C/W/A: customer 14 frames, worker 20 frames, admin 16 frames.
- Explicit foundations for role colors, typography families, radius, 8pt spacing, and bottom safe behavior.
- Useful operational state coverage: loading, empty, error, success, dispatch, grab, audit, after-sale, and cancellation states.
- FlowMap gives a shared order-state narrative across customer, worker, and admin.

## Figma Draft Gaps

- No formal local Figma components, component sets, styles, or variable collections were detected.
- Tokens are visible design notes, not machine-bound Figma variables.
- Dashboard and OA have no standalone product frames.
- Admin frames are mobile-style, so desktop admin requires careful responsive adaptation.
- Some required engineering components are not yet present in `@xlb/ui`: `SearchBar`, `Tabs`, `BottomSheet`, `StatCard`, `ServiceCard`, `OrderCard`, `WorkOrderCard`, `SettlementCard`.

## Codex Design Optimization Principles

- Preserve Figma role colors and visible product hierarchy.
- Use CSS variables for semantic and role tokens.
- Mark unknown token values as unknown instead of inventing factual design tokens.
- Add only page-needed components, not a speculative large UI library.
- Keep C/W mobile-first for Phase 15.2 unless user confirms a broader responsive redesign.
- Adapt Admin to desktop density while preserving Figma modules, state language, city/audit constraints, and existing Settlement/Governance behavior.

## Render Optimization Checklist

- Normalize role colors into semantic tokens.
- Use one restrained card shadow and one floating overlay shadow.
- Keep radius values tied to `16/24/28`, with `8px` only as a compact implementation suggestion.
- Avoid heavy `backdrop-filter`, large blur layers, and decorative gradients.
- Reserve stable dimensions for shell, cards, buttons, nav, status rows, and skeleton states.
- Use real loading/empty/error/retry patterns instead of fake success.
- Compress runtime images and treat exported PNGs as documentation references only.
- Lazy-load non-first-screen views after route shells are stable.

## `@xlb/ui` Gaps

Recommended order before or during Phase 15.2:

1. Role/semantic CSS variable token bridge.
2. `SearchBar`.
3. `Tabs` or segmented filters.
4. `BottomSheet`.
5. `StatCard`.
6. `ServiceCard`.
7. `OrderCard`.
8. `WorkOrderCard` / `WorkerTaskCard`.
9. `SettlementCard` only when Phase 15.5 harmonizes existing settlement pages.

## Phase 15.2 Recommendation

Phase 15.2 may begin after human confirmation of responsive strategy. Recommended first scope:

- Customer route shell from `Customer / Home / Default` and `Customer / Services / Default`.
- Worker route shell from `Worker / GrabHall / Online` and worker state frames.
- Use real API empty/error/loading states.
- Do not implement Dashboard/OA fake MVP.
- Do not invent order, task, settlement, audit, or income success states.

## Phase 15.3 / 15.4 / 15.5 Landing Suggestions

- Phase 15.3 Customer: add `ServiceCard` and `OrderCard`, then connect real catalog/order APIs.
- Phase 15.4 Worker: add `BottomSheet` and `WorkOrderCard`, then connect task/grab/fulfillment APIs.
- Phase 15.5 Admin: adapt Admin frames into desktop `AdminShell`, preserve existing Settlement/Governance logic, add `StatCard` and operational table/card states where needed.

## User Confirmation Needed

- Should Phase 15.2 reproduce the 390px mobile frames exactly inside centered web containers, or adapt them more broadly for desktop?
- Should customer and worker desktop views remain mobile-width in Phase 15.2?
- Which customer route should be implemented first: home, services, or order creation?
- Which worker route should be implemented first: grab hall or task detail?
- Should admin desktop harmonization wait until after customer/worker route shell replacement?

## Production Conclusion

Production remains NO-GO. No deploy, no production env, and no tag were performed.
