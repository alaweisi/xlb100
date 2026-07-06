# Phase 15.2 Route Shell Report

## Scope

Phase 15.2 replaced the Phase 0 placeholder app entry experience with Figma-based route shells for the three core apps:

- `apps/customer/src/app/App.tsx`
- `apps/worker/src/app/App.tsx`
- `apps/admin/src/app/App.tsx`

No backend, database, deployment, production, dashboard, OA, or `packages/ui` files were changed in this phase.

## Source Basis

- Figma snapshot: `docs/design/figma/pages.json`
- Figma component inventory: `docs/design/figma/components.json`
- Optimized render rules: `docs/design/figma/optimized/component-render-rules.md`
- Page render strategy: `docs/design/figma/optimized/page-render-strategy.md`
- Shared primitives and layout shells from `@xlb/ui`

Customer and worker shells follow the 390px mobile-first route shell strategy with a centered web container. Admin keeps the existing settlement/governance page behavior and wraps it in the shared admin shell.

## Customer Routes

Implemented route shell mapping:

- `/customer/`
- `/customer/services`
- `/customer/order/create`
- `/customer/orders`
- `/customer/profile`

The customer shell uses `MobileShell`, `TopBar`, `BottomNav`, `SearchBar`, `ServiceCard`, `OrderCard`, `Tabs`, `Card`, `EmptyState`, `ErrorState`, and `Skeleton`.

No business API is connected. Service catalog, order creation, order list, profile, address, and account data remain rendered as explicit empty/not-wired states.

## Worker Routes

Implemented route shell mapping:

- `/worker/`
- `/worker/tasks`
- `/worker/wallet`
- `/worker/profile`
- `/worker/certification` routes to the same profile/certification shell state.

The worker shell uses `MobileShell`, `TopBar`, `BottomNav`, `SearchBar`, `Tabs`, `StatCard`, `WorkerTaskCard`, `Card`, `EmptyState`, and `ErrorState`.

No business API is connected. Task pool, accepted tasks, wallet/income, qualification, and worker profile data remain rendered as explicit empty/not-wired states.

## Admin Shell

The admin app now wraps the existing settlement console routes in `AdminShell`, `SideNav`, `TopBar`, and `Badge` while preserving existing hash routing:

- dashboard: existing `SettlementOpsPage`
- detail: existing `SettlementStatementDetailPage`
- exports: existing `SettlementExportReviewPage`
- governance: existing `SettlementActionGovernancePage`

No API base behavior was changed in Phase 15.2. The Phase 14F same-origin API behavior remains intact.

## Phase 0 Placeholder Removal

`Phase 0 Ready` no longer appears in customer, worker, or admin app source.

Static check:

- `rg -n "Phase 0 Ready" apps/customer apps/worker apps/admin`: PASS, no matches.

## API / Network Safety

No route shell connects to business APIs and no fake business success state was introduced.

Static check:

- `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client`: PASS, no matches.

## Deferred Apps

Dashboard and OA remain deferred because the Figma snapshot does not contain standalone dashboard/OA product frames. This phase does not create fake MVPs for those apps.

## Gatefix / Local Test Environment

Before committing Phase 15.2, Phase 15.2-GATEFIX allowed only these route shell entry files through the existing provider-withdraw UI gates:

- `apps/customer/src/app/App.tsx`
- `apps/worker/src/app/App.tsx`

Admin app shell was already allowlisted. The provider-withdraw / settlement security checks remain active.

Local root test requires MySQL on `127.0.0.1:3306`. The existing local compose stack was started with:

- `docker compose -f deploy/compose/docker-compose.local.yml up -d`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1`
- `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/seed-local.ps1`

## Verification

- `pnpm --filter @xlb/customer typecheck`: PASS
- `pnpm --filter @xlb/worker typecheck`: PASS
- `pnpm --filter @xlb/admin typecheck`: PASS
- `pnpm --filter @xlb/customer build`: PASS
- `pnpm --filter @xlb/worker build`: PASS
- `pnpm --filter @xlb/admin build`: PASS
- `pnpm test -- --bail=1`: PASS, 255 test files passed, 1048 tests passed, 1 todo.
- Phase 0 Ready search: PASS, no matches.
- localhost/api-api search: PASS, no matches.

## Recommendation

Phase 15.3 may proceed after human confirmation. Recommended next scope is customer page content deepening against the Figma snapshot and real API contract boundaries. Dashboard and OA should remain deferred until product frames exist.
