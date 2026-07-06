# Phase 15.0D Render Performance Guidelines

These guidelines apply when Phase 15.2+ begins implementation. They are derived from the Figma snapshot and the current `@xlb/ui` MVP.

## CSS Variables For Tokens

- Carry role colors, semantic surfaces, radius, shadows, spacing, and safe-area values through CSS variables.
- Avoid repeated hardcoded role hex values in app pages.
- Keep Figma facts and Codex Design suggestions separate in token naming comments or docs.
- Prefer app root role scopes such as `[data-role="customer"]`, `[data-role="worker"]`, and `[data-role="admin"]`.

## Backdrop / Blur

- Avoid heavy `backdrop-filter` in route shells and card stacks.
- Do not use large full-screen blur layers behind every modal or sheet.
- If overlay blur is required, use it sparingly for one overlay layer and test on mobile.

## Box Shadow

- Use one reusable card shadow and one reusable floating shadow.
- Avoid multiple nested shadow layers on dense card lists.
- In admin desktop tables and filters, prefer borders and surface contrast over heavy shadows.

## Gradients

- The Figma snapshot is role-color and card driven, not gradient driven.
- Do not add decorative gradients to replace missing implementation polish.
- If gradients are used for skeletons, keep shimmer subtle and low contrast.

## Images

- Local PNG snapshots are reference assets, not runtime assets.
- Runtime images must be compressed before commit and lazy-loaded when below first screen.
- Any image over 5MB requires explicit report and should not be blindly committed.

## SVG Components

- Convert icons to reusable SVG/React components only when the page needs them.
- Keep icon sizes consistent with detected 20px/24px patterns.
- Avoid importing large icon sets wholesale if only a few icons are needed.

## Skeleton Loading

- Use skeletons for API-backed content regions where final dimensions are known.
- Do not use full-page shimmer for every route; keep nav/header stable.
- Avoid endless skeleton loops with no error fallback.
- Limit shimmer count on mobile to reduce paint cost.

## Lazy Loading

- Route-split non-first-screen pages after the first product shell is stable.
- Lazy-load heavy detail panels, image-dependent sections, and admin secondary modules.
- Do not lazy-load core shell components in a way that creates blank first paint.

## CLS / Layout Shift

- Reserve stable heights for TopBar, BottomNav, primary buttons, status rows, cards, and table rows.
- Loading, empty, and error states must occupy predictable blocks.
- Buttons with loading labels must keep width stable.
- Use fixed icon slots so text does not jump when icons load.

## First Screen Strategy

- Customer first screen: render shell, location/service entry skeleton, then real service content or empty/error.
- Worker first screen: render shell and online/task availability skeleton; do not show fake orders.
- Admin first screen: render shell and metric skeletons; do not show fake metrics.
- Keep first paint lightweight: CSS variables, minimal shadows, no large runtime images.

## Mobile Low-End Device Risk

- Avoid long lists with heavy card shadows and animated skeletons.
- Prefer pagination, virtualized lists, or incremental rendering for long operational lists.
- Keep fixed bottom nav/action bars simple and avoid compositing-heavy translucent effects.
- Test scroll performance when card counts grow.

## Admin Desktop Risk

- Admin screens should be dense but not decorative.
- Prefer table/card hybrid patterns with stable row heights.
- Avoid rendering every offscreen detail drawer, modal, and timeline eagerly.
- Audit/detail panels should mount when opened unless preloading is necessary for workflow speed.
