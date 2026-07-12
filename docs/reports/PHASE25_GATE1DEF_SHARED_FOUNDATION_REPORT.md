# Phase 25 Gate 1D–1F Shared UI Foundation Report

## Scope

- Gate 1D: safely consume an already-validated `CampaignPresentation` and
  `AssetManifest` without rendering remote markup, styles, scripts, URLs, or
  unapproved CTA navigation.
- Gate 1E: provide a visual-only role/mode shell that owns no route, API,
  workflow, state-machine, quote, permission, or audit decision.
- Gate 1F: provide a deterministic gallery scenario matrix for the five roles
  and key fallback/accessibility states. It contains no simulated business data.

## Delivered

- `packages/ui/src/campaign/presentationSlots.tsx`
  - rechecks source policy at the DOM boundary;
  - resolves only manifest-contained fallback assets;
  - removes an unknown CTA action key instead of navigating anywhere;
  - omits unsafe decorative content without blocking its host workflow surface.
- `packages/ui/src/shells/SemanticShell.tsx`
  - applies role/mode markers and semantic CSS variables only.
- `packages/ui/src/gallery/runtimeThemeGallery.ts`
  - covers Customer, Worker, Admin, OA, Dashboard, forced colors, reduced
    motion, low-power/no-backdrop conditions, invalid/expired/kill-switch and
    asset fallback states.
- `tests/unit/phase25PresentationSlots.test.tsx` and
  `scripts/check-phase25-gate1def.mjs`.

## Verification

- `pnpm gate:phase25:gate1def`: passed, 3/3 tests.
- `pnpm --filter @xlb/ui typecheck`: passed.
- `pnpm typecheck`: passed, 17/17 tasks.
- `pnpm gate:phase25:gate1c`: passed, 8/8 tests.
- `git diff --check`: passed.

## Known combined-run condition

The historical Gate 1A/1B and design scripts still enforce their former
single-work-package isolation. During explicitly authorized parallel Phase 25
construction, they correctly report later shared/UI application files as
out-of-scope. This is a gate-script policy conflict, not a shared-foundation
test failure; final unified acceptance needs a phase-wide aggregate gate.

## Boundary statement

No application, backend, database, API client, route, workflow action,
campaign publication, pricing, permission, or state-machine behavior was
implemented by this work package.
