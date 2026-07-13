# Phase 25 Gate 1B — Material & Role Recipes Report

## Status

- Work unit: Gate 1B Material & Role Recipes
- Gate 1A acceptance: explicit human acceptance on 2026-07-12
- Implementation model: three parallel source-grounded Agent workstreams plus primary-agent contract reconciliation
- Page/component/App construction: not entered
- Gate 1C runtime bridge: not entered

## Source authorities

- Customer: `docs/design/ui/phase25/references/customer-apple-liquid-glass-source.png`.
- Shared foundations: `docs/design/figma/assets/images/foundations_1-23.png`.
- Worker: `docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png`.
- Admin: `docs/design/figma/frames/admin/admin_dashboard_default_1-2875.png`.
- OA/Dashboard: no standalone product frames; both remain readiness blocked.

All four available visual sources were inspected before recipe construction. Gate 1B defines token-reference contracts only; there is no rendered page, so this report does not claim screenshot fidelity or visual QA completion.

## Delivered

### Customer liquid glass

- Warm cream/amber ambience, ink-green/coffee typography and Customer orange references.
- Translucent glass, blur, saturation, bright edge, inner stroke and ambient shadow hierarchy.
- 390 compact foundation, 8-point spacing family, 24/28px large-radius family, 44px touch target and 92px bottom navigation reservation.
- Noto Serif SC display and Noto Sans SC reading hierarchy.
- Explicit no-backdrop, forced-colors, reduced-motion and low-power fallbacks.

### Worker and Admin

- Worker recipe is grounded in the deep-blue GrabHall source and prioritizes outdoor readability, task hierarchy, protected warning/danger/stale states, touch targets and bottom safe area.
- Admin recipe is grounded in the purple operations source and prepares dense desktop grid, compact controls, tabular numbers, overlay/modal layering and protected audit/risk states.

### OA and Dashboard

- OA and Dashboard recipes remain `readiness: blocked` and use shared semantic references only.
- No `role.oa.*` or `role.dashboard.*` color system was invented.
- Dashboard freezes chart axis/grid/threshold, alert, stale/freshness and numeric/display priority without pretending that realtime data or a standalone screen exists.

### Runtime capability recipes

- `no-backdrop-filter`: opaque surface fallback preserving hierarchy and boundaries.
- `forced-colors`: removes decorative glass/Campaign dependency and protects system colors/focus.
- `reduced-motion`: zeroes non-essential travel and duration through canonical references.
- `low-power`: reduces blur, shadow and persistent motion while retaining realtime freshness indicators.
- All declarations are runtime immutable and contain token references rather than copied CSS values.

## Engineering guardrails

- `scripts/check-phase25-gate1b.mjs` verifies sources, recipes, tests, public exports, readiness blocks, raw-color prohibition and phase boundaries.
- Apps, backend, database, API Client, non-token UI, migration 054 and Gate 1C App integration remain blocked.
- Recipe declarations cannot contain workflow, permission, amount, quote, city, audit or idempotency decisions.

## Verification

- Customer material tests: 5 passed.
- Worker/Admin/OA/Dashboard role tests: 6 passed.
- Runtime capability tests: 6 passed.
- Gate 1B boundary/security tests: 4 passed.
- Gate 1B focused total: 21/21 passed.
- Full workspace typecheck: 17/17 tasks passed.
- Full workspace build: 11/11 tasks passed.
- Full unit/contract regression: 154 files passed; 837 tests passed; 1 pre-existing todo retained.
- Full architecture preflight: passed, including all locked Phase gates plus Gate 1A and Gate 1B.
- Phase 25 design/scope gate, Gate 1A compatibility gate and `git diff --check`: passed.

## Exit boundary

Gate 1B is eligible for human acceptance. Focused tests, public-export verification, typecheck, build, unit/contract regression, Phase 25 gates, architecture preflight and diff hygiene pass. Gate 1C remains blocked until explicit acceptance.

## Final Lock metadata correction

The preceding exit boundary is preserved as Gate 1B's interim, chronological evidence. It is superseded by the final Phase 25 Lock conclusion: Phase 25 is `LOCKED` on `main` commit `be9f569` with tag `xlb-phase25-ui-standardization-v1.0`. Final Lock verification passed the Phase25 closure gate, typecheck, build, 342 files / 1,373 tests with 1 existing todo, preflight, and diff hygiene. Gate 1C was subsequently accepted and Phase 25 construction was completed; it is not currently blocked. See `docs/reports/PHASE25_LOCK_METADATA_CORRECTION_REPORT.md`.
