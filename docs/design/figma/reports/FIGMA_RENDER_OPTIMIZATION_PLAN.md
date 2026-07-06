# Phase 15.0C Figma Render Optimization Plan

This plan captures render optimization and modification guidance. It is not permission to freely redesign pages.

## A. Visual Render Optimization

- Card shadow: keep shadows restrained. The Figma cards rely heavily on stacked cards; web implementation should avoid heavy multi-layer shadows that make dense mobile/admin views muddy.
- Radius: normalize to explicit token values from Figma (`16`, `24`, `28`) and map smaller web utility controls carefully instead of mixing arbitrary radii.
- Background layering: preserve the warm cream/background and elevated white card hierarchy, but avoid nesting cards inside cards unless the Figma frame explicitly requires it.
- Gradients: keep gradients restrained; the source snapshot is more palette/card based than gradient driven.
- Icons: standardize icon size around detected 20/24px app icons and avoid mixing visual weights.
- Color contrast: role palettes are dark and saturated; verify text contrast on customer orange, worker blue, admin purple, cream, and coffee surfaces before browser UAT.
- Text hierarchy: maintain clear page eyebrow/title/body/card hierarchy; do not inflate compact card headings into hero-scale text.
- Mobile density: preserve the 390x844 mobile rhythm, bottom safe area, and reachable primary actions.
- Admin density: admin frames are mobile-style in this snapshot; web admin implementation must adapt to operational density without inventing unrelated dashboard layouts.

## B. Frontend Render Performance Optimization

- Use CSS variables to carry Figma role tokens and avoid repeated inline hardcoded color values across app pages.
- Avoid excessive `backdrop-filter`, large blur layers, and large translucent overlays; these can increase repaint cost on mobile browsers.
- Keep card shadows simple and reusable; avoid unique per-card shadow strings.
- Compress PNG/JPEG assets before committing large page imagery. Current exported PNGs are reference snapshots only.
- Convert reusable icons to React/SVG components only when they are actually needed by implementation.
- Use skeleton loading for API-backed sections where the user waits on real data.
- Use lazy loading for non-first-screen route chunks and image-heavy sections.
- Reserve stable dimensions for bottom nav, top bar, cards, status rows, and action buttons to reduce layout shift.
- Split first-screen shell/components from non-first-screen detail views when route bundles start to grow.

## C. Engineering Implementation Optimization

- `@xlb/ui` already covers the minimum primitives and shells: `Button`, `Card`, form controls, state blocks, `Modal`, `Drawer`, `Toast`, `PageShell`, `MobileShell`, `AdminShell`, `BottomNav`, `TopBar`, and `SideNav`.
- Next token work: add role color aliases, radius scale, semantic surface/text/border tokens, bottom safe area spacing, and shadow/elevation tokens.
- Next component work: add `SearchBar`, `Tabs` or segmented filter, `BottomSheet`, `StatCard`, `ServiceCard`, `OrderCard`, `WorkOrderCard`/`WorkerTaskCard`, and role-aware status chips.
- Customer first screen should start from `Customer / Home / Default` and connect only to real service/order APIs or honest empty/error states.
- Worker first screen should start from `Worker / GrabHall / Online` and never fake task availability or grab success.
- Admin should use `Admin / Dashboard / Default`, `WorkOrderPool`, `Dispatch`, `MasterAudit`, `Complaint`, `AfterSale`, and `Settings` frames as UI direction while preserving existing Settlement/Governance API behavior.
- User confirmation needed: whether Phase 15.2 should prioritize exact mobile viewport reproduction or responsive web adaptation of the same design language.
- Directly allowed for Phase 15.2: customer/worker route shell replacement from Phase 0 Ready to Figma-following product shells with real empty/error/loading states.
- Not allowed for Phase 15.2 without further confirmation: dashboard/OA fake MVP, production deployment, staging deployment, or invented business data.
