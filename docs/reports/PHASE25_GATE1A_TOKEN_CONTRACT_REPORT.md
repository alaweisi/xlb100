# Phase 25 Gate 1A — Token Contract Report

## Status

- Work unit: Gate 1A Token Contract
- Gate 0 acceptance: explicit human acceptance on 2026-07-12
- Implementation model: three parallel Agent workstreams with non-overlapping file ownership, followed by primary-agent contract reconciliation
- Page construction: not entered
- Backend / database / Campaign API: unchanged
- Acceptance: accepted by explicit human instruction on 2026-07-12
- Gate 1B: subsequently authorized as an independent work unit

## Delivered

### Canonical token system

- `packages/ui/src/tokens/base/defaultTokens.ts` is the single compiled token value source.
- L0–L7 taxonomy, five role identities and four runtime modes are typed and exported.
- Foundation domains now cover semantic color/surface/text/border, typography, spacing, size, grid, breakpoints, safe area, radius, stroke, shadow, blur, opacity, z-index, motion, icons, state, charts, glass and campaign presentation.
- Three unused `.theme.json` files were removed, eliminating the JSON/TypeScript dual source.

### Protected semantics and Campaign L4

- Focus, success/warning/danger, stale and Dashboard chart threshold semantics are protected.
- The shared contract and UI resolver agree on exactly nine remote Campaign paths.
- Remote values accept strict hex colors or bounded `0..1` decoration values only.
- Unknown paths, protected paths, CSS functions, HTML/script payloads, non-finite numbers and prototype keys are rejected.
- Registered themes resolve through the same controlled Campaign namespace; unknown requested themes report the real `default` resolved id.

### Five-system runtime contract

- `RuntimeThemeEnvelope` covers Customer, Worker, Admin, OA and Dashboard roles.
- Contract fields include schema/revision, role/mode/city, route/placement scope, Campaign identity/revision, resolution reason, TTL, kill switch and safe default fallback.
- `CampaignPresentation` uses bounded copy, unique placements and allowlisted application `actionKey` CTAs.
- `RuntimeThemeAssetManifest` enforces same-origin or HTTPS-allowlisted sources, SRI, MIME, dimensions, byte budgets, alt/decorative semantics, non-interactive assets and acyclic fallbacks.
- The Zod validator is strict and cross-validates scope, assets, Campaign/default invariants and kill-switch responses.

### Engineering guardrails

- `scripts/check-phase25-gate1a.mjs` is a fail-closed Gate 1A boundary.
- Gate 1A blocks changes in apps, backend, database, API Client, non-token UI source and migration 054.
- Customer/Worker/Admin hardcode debt is recorded as a deterministic, machine-readable baseline that may only decrease.
- The gate rejects reintroduction of `.theme.json` dual sources and checks token/runtime-contract markers and cross-package Campaign path consistency.

## Verification

- Gate 1A focused token tests: 9 passed.
- Runtime-theme contract tests: 12 passed.
- Gate 1A security/boundary tests: 3 passed.
- `@xlb/types` typecheck: passed.
- `@xlb/validators` typecheck: passed.
- `@xlb/ui` typecheck and build: passed.
- Gate 1A script: passed.
- Full workspace typecheck: 17/17 tasks passed.
- Full workspace build: 11/11 tasks passed.
- Full regression aggregate: 184/185 files and 520/521 tests passed; the only failure was the pre-existing Phase 23C PowerShell boundary test exceeding its 15-second timeout under full-suite load. Immediate isolated rerun passed 3/3 in 9.64 seconds. No functional assertion failed.
- Full architecture preflight: passed, including the new Gate 1A preflight hook and all locked Phase gates.
- Phase 25 design/scope gate and `git diff --check`: passed.

## Boundaries retained

- No App root consumes `ThemeProvider` yet; that belongs to Gate 1C.
- No Customer glass recipe, Worker/Admin/OA/Dashboard role recipe or material implementation; that belongs to Gate 1B.
- No backend Campaign service, migration, API Client bridge or Admin Campaign publishing UI.
- No page route or business workflow was changed.
- No existing Campaign, order, payment, dispatch, fulfillment, ledger, settlement, refund, aftersale or support state machine was changed.

## Exit decision

Gate 1A is eligible for human acceptance. Typecheck, build, focused tests, isolated retry of the sole full-suite timeout, Phase 25 gates, architecture preflight and diff hygiene pass. The full-suite timeout is recorded rather than hidden; Gate 1B remains blocked until explicit acceptance.

## Final Lock metadata correction

The preceding exit decision is preserved as Gate 1A's interim, chronological evidence. It is superseded by the final Phase 25 Lock conclusion: Phase 25 is `LOCKED` on `main` commit `be9f569` with tag `xlb-phase25-ui-standardization-v1.0`. Final Lock verification passed the Phase25 closure gate, typecheck, build, 342 files / 1,373 tests with 1 existing todo, preflight, and diff hygiene. Gate 1B was subsequently accepted and Phase 25 construction was completed; it is not currently blocked. See `docs/reports/PHASE25_LOCK_METADATA_CORRECTION_REPORT.md`.
