# Phase 15 Progress

## Current Status

- Current subdivision: Phase 15.1 packages/ui minimum Design System.
- Strategy: Local-first only.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.1 Scope

Allowed:

- `packages/ui/**`
- `docs/execution/PHASE15_PROGRESS.md`

Forbidden:

- `apps/customer/**`
- `apps/worker/**`
- `apps/admin/**`
- `apps/dashboard/**`
- `apps/oa/**`
- `backend/**`
- `db/**`
- `deploy/**`
- `infra/**`
- production configuration

## Phase 15.1 Implementation Record

- Added reusable UI primitives and state components to `@xlb/ui`.
- Added reusable layout shells and navigation components to `@xlb/ui`.
- Kept `tokens` export compatible.
- Did not connect business APIs.
- Did not write app pages.
- Did not use fake business data.
- Did not modify any app package.

## Phase 15.1 Verification

- `pnpm --filter @xlb/ui build`: PASS
- `pnpm --filter @xlb/ui typecheck`: PASS
- `pnpm test -- --bail=1`: PASS
- staged-file scope check: pending commit staging

## Stop Rule Before Phase 15.2

Phase 15.2 must wait for user-provided Figma MCP access/design context. The user has existing finished UI for the three apps, so page construction must follow Figma design. Codex must not freely design customer, worker, or admin pages.

## Phase 15.0C Figma Design Snapshot

- Status: completed locally.
- Figma MCP read: PASS.
- Source: `https://www.figma.com/design/WrIq7mTPz9zB5EJkftS3sY/Untitled?node-id=1-2&t=qQ8sSMGYxKB5zpJn-0`
- Root node: `1:2`.
- Local snapshot directory: `docs/design/figma/`.
- Exported JSON/docs: `README.md`, `source.md`, `manifest.json`, `tokens.json`, `components.json`, `pages.json`.
- Exported reports: `FIGMA_DESIGN_INTAKE.md`, `FIGMA_COMPONENT_MAP.md`, `FIGMA_RENDER_OPTIMIZATION_PLAN.md`.
- Detected product frames: customer 14, worker 20, admin 16.
- Dashboard standalone frames: 0.
- OA standalone frames: 0.
- Local PNG snapshots exported: 12.
- Render optimization plan: generated.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.2 Gate

Phase 15.2 may proceed only after human confirmation that implementation should follow this Figma snapshot. Customer, worker, and admin pages must use `docs/design/figma/` and Figma MCP as source of truth. Dashboard and OA remain blocked from fake MVP because the Figma snapshot did not include standalone dashboard/OA product frames.

## Phase 15.0D Codex Design Render Optimization

- Status: completed locally.
- Source basis: Figma snapshot `docs/design/figma/`, Phase 15.0C reports, and current `@xlb/ui` MVP.
- Output directory: `docs/design/figma/optimized/`.
- Generated files:
  - `docs/design/figma/optimized/README.md`
  - `docs/design/figma/optimized/tokens.optimized.json`
  - `docs/design/figma/optimized/component-render-rules.md`
  - `docs/design/figma/optimized/page-render-strategy.md`
  - `docs/design/figma/optimized/render-performance-guidelines.md`
  - `docs/design/figma/reports/PHASE15_0D_CODEX_DESIGN_OPTIMIZATION_REPORT.md`
- Scope: documentation/design optimization only.
- App code modified: no.
- `packages/ui` code modified: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.2 Recommendation After 15.0D

Phase 15.2 is recommended only after human confirmation of responsive strategy. Recommended entry scope is customer/worker route shells based on the Figma snapshot, with real loading/empty/error/retry states and no fake business success. Dashboard and OA remain blocked from fake MVP.

Manual confirmation points:

- Whether Phase 15.2 should exactly reproduce the 390px mobile frames inside centered web containers or adapt more broadly for desktop.
- Whether customer/worker desktop views should stay mobile-width during the first implementation pass.
- Whether to prioritize customer home/services before worker grab hall, or build both shells in one controlled phase.
- Whether admin desktop harmonization waits until after customer/worker route shell replacement.

## Phase 15.1B UI Gap Fill

- Status: completed locally, pending commit.
- Scope: `packages/ui/**`, `docs/execution/PHASE15_PROGRESS.md`, `docs/reports/PHASE15_1B_UI_GAP_FILL_REPORT.md`.
- Added exports: `SearchBar`, `Tabs`, `SegmentedControl`, `BottomSheet`, `StatCard`, `ServiceCard`, `OrderCard`, `WorkOrderCard`, `WorkerTaskCard`.
- Deferred: `SettlementCard` remains Phase 15.5 because it must align with existing admin Settlement pages and governance constraints.
- App code modified: no.
- Business API connected: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/ui build`: PASS.
  - `pnpm --filter @xlb/ui typecheck`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
- Phase 15.2 entry: allowed after commit, with production still NO-GO and dashboard/OA still deferred.

## Phase 15.2-GATEFIX / TESTENV

- Status: completed locally.
- Commit: `6f5ea27a57c153ae408480c391f5060f8d33ca29` (`test(security): allow phase15 route shell app entries`).
- Scope: provider-withdraw security gate scripts only.
- Gate policy: preserved provider-withdraw / settlement UI protection and added only Phase 15.2 AppShell entry files to the allowlist:
  - `apps/customer/src/app/App.tsx`
  - `apps/worker/src/app/App.tsx`
- Local DB/Docker: started existing local compose stack with `deploy/compose/docker-compose.local.yml`.
- Migration/seed:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/seed-local.ps1`: PASS.
- Verification:
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.2 Route Shells

- Status: completed locally, pending this commit.
- Commit: this commit (`feat(frontend): add figma-based route shells for core apps`).
- Scope:
  - `apps/customer/src/app/App.tsx`
  - `apps/worker/src/app/App.tsx`
  - `apps/admin/src/app/App.tsx`
  - `docs/reports/PHASE15_2_ROUTE_SHELL_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Customer routes:
  - `/customer/`
  - `/customer/services`
  - `/customer/order/create`
  - `/customer/orders`
  - `/customer/profile`
- Worker routes:
  - `/worker/`
  - `/worker/tasks`
  - `/worker/wallet`
  - `/worker/profile`
  - `/worker/certification` mapped to the profile/certification shell state.
- Admin shell:
  - Existing Settlement / Export Review / Statement Detail / Governance routes are preserved and wrapped with `AdminShell`, `SideNav`, and `TopBar`.
- Business API connected: no.
- Fake business data: no.
- Phase 0 Ready: removed from customer/worker/admin app source.
- Dashboard/OA: deferred because no standalone Figma product frames exist.
- Verification:
  - `pnpm --filter @xlb/customer typecheck`: PASS.
  - `pnpm --filter @xlb/worker typecheck`: PASS.
  - `pnpm --filter @xlb/admin typecheck`: PASS.
  - `pnpm --filter @xlb/customer build`: PASS.
  - `pnpm --filter @xlb/worker build`: PASS.
  - `pnpm --filter @xlb/admin build`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
  - `rg -n "Phase 0 Ready" apps/customer apps/worker apps/admin`: PASS, no matches.
  - `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client`: PASS, no matches.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.
- Phase 15.3 entry: recommended only after human confirmation; continue to follow the Figma snapshot and avoid dashboard/OA fake MVPs.

## Phase 15.3 Customer Minimal Real Business Loop

- Status: completed locally, pending this commit.
- Commit: this commit (`feat(customer): wire minimal real business loop`).
- Scope:
  - `apps/customer/src/app/App.tsx`
  - `packages/api-client/src/customer.ts`
  - `docs/reports/PHASE15_3_CUSTOMER_LOOP_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Real APIs wired:
  - `GET /api/catalog`
  - `GET /api/pricing/quote?skuId=...`
  - `POST /api/orders`
  - `GET /api/orders/:orderId`
  - `POST /api/payments/orders`
- Not-wired by design:
  - Customer order list API.
  - Customer profile/account API.
  - Customer address book API.
  - Real customer payment provider checkout/callback flow.
- Customer pages:
  - `/customer/`: real catalog-backed home/search entry.
  - `/customer/services`: real catalog category/search shell.
  - `/customer/order/create`: real catalog + quote + order create + payment order create + order detail verification.
  - `/customer/orders`: explicit not-wired list API state plus real detail re-read for locally created order IDs.
  - `/customer/profile`: explicit not-wired customer profile/account state.
- Backend code modified: no.
- `packages/types` modified: no.
- Business fake data introduced: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/customer typecheck`: PASS.
  - `pnpm --filter @xlb/customer build`: PASS.
  - `pnpm --filter @xlb/api-client typecheck`: PASS.
  - `pnpm --filter @xlb/types typecheck`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
  - `rg -n "Phase 0 Ready" apps/customer`: PASS, no matches.
  - `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer packages/api-client`: PASS, no matches.
  - `rg -n "mock|fake|dummy" apps/customer packages/api-client`: reviewed. Matches are limited to the existing api-client local payment webhook helper and are not used by the customer page.
- Phase 15.4 entry: recommended only after full verification and commit; continue local-first, production NO-GO.
