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

## Phase 15.3B Three-App Figma Visual Productization Pass

- Status: completed locally, pending this commit and cloud-staging UAT upload.
- Commit: this commit (`feat(frontend): align three apps with figma visual system`).
- Scope:
  - `packages/ui/**`
  - `apps/customer/**`
  - `apps/worker/**`
  - `apps/admin/**`
  - `docs/reports/PHASE15_3B_THREE_APP_VISUAL_PRODUCTIZATION_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Figma sources:
  - `docs/design/figma/pages.json`
  - `docs/design/figma/optimized/component-render-rules.md`
  - `docs/design/figma/optimized/page-render-strategy.md`
  - `docs/design/figma/optimized/tokens.optimized.json`
- Customer:
  - Preserve Phase 15.3 real API loop.
  - No fake orders, users, addresses, or payments.
  - Existing not-wired profile/order-list states remain explicit.
- Worker:
  - Productized GrabHall, Tasks, Income, and Mine shells.
  - Task pool, qualification, wallet/income, and fulfillment remain not-wired.
  - No fake tasks, earnings, qualification, or online status.
- Admin:
  - Preserve Settlement/Governance logic and same-origin API behavior.
  - Productize AdminShell, cards, tables, loading/empty/error states, city_scope status, and governance boundary panels.
  - Do not rewrite settlement or governance workflows.
- Dashboard/OA: still deferred.
- Production: NO-GO.
- Cloud-staging: requested after commit for UAT only.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/ui typecheck`: PASS.
  - `pnpm --filter @xlb/ui build`: PASS.
  - `pnpm --filter @xlb/customer typecheck`: PASS.
  - `pnpm --filter @xlb/customer build`: PASS.
  - `pnpm --filter @xlb/worker typecheck`: PASS.
  - `pnpm --filter @xlb/worker build`: PASS.
  - `pnpm --filter @xlb/admin typecheck`: PASS.
  - `pnpm --filter @xlb/admin build`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
  - `rg -n "Phase 0 Ready" apps/customer apps/worker apps/admin`: PASS, no matches.
  - `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client`: PASS, no matches.
  - `rg -n "mock|fake|dummy" apps/customer apps/worker apps/admin packages/api-client`: reviewed. Matches are limited to the existing api-client local payment webhook helper and are not used by customer/worker/admin pages to fabricate business records.

## Phase 15 UI Visual Refinement Skill

- Status: completed locally, pending this commit.
- Commit: this commit (`docs(phase15): add ui visual refinement skill`).
- Scope:
  - `docs/prompts/CODEX_PHASE15_UI_VISUAL_REFINEMENT_SKILL.md`
  - `.cursor/rules/phase15-ui-visual-system.mdc`
  - `docs/execution/PHASE15_PROGRESS.md`
- Purpose: codify Figma + Codex Design + `packages/ui` UI construction rules for customer, worker, and admin Phase 15 visual refinement.
- App code modified: no.
- `packages/ui` code modified: no.
- Backend/db/deploy/infra modified: no.
- Production: NO-GO.
- Tags: not created.

## Phase 15.3C Figma Visual Refinement & zh-CN Copy Pass

- Status: completed locally, pending commit.
- Commit: this commit (`feat(frontend): refine three app figma visual system`).
- Scope:
  - `packages/ui/**`
  - `apps/customer/**`
  - `apps/worker/**`
  - `apps/admin/**`
  - `docs/reports/PHASE15_3C_FIGMA_VISUAL_REFINEMENT_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Source basis:
  - `docs/prompts/CODEX_PHASE15_UI_VISUAL_REFINEMENT_SKILL.md`
  - `.cursor/rules/phase15-ui-visual-system.mdc`
  - `docs/design/figma/**`
  - `docs/design/figma/optimized/**`
- UI additions:
  - `HeroCard`
  - `MetricCard`
  - `GuardrailCard`
  - `NotWiredState`
  - `ApiErrorPanel`
  - `AdminToolbar`
  - `ScopeBadge`
  - `StateBadge`
  - `CustomerQuoteCard`
  - `WorkerStatusCard`
- Customer:
  - Preserved real catalog, pricing quote, order create, order detail, and payment order wiring.
  - Did not create fake payment success, fake dispatch, fake user profile, fake address, or fake order list data.
- Worker:
  - Preserved explicit not-wired/empty states for task pool, task detail, eligibility, wallet/income, and certification.
  - Did not create fake tasks, fake earnings, fake credentials, or fake online state.
- Admin:
  - Preserved Settlement/Governance logic and same-origin API behavior.
  - Refined admin shell, metric cards, city scope, tables, loading, empty, and error states.
  - Did not swallow backend errors and did not enable execution actions.
- Backend/db/deploy/infra modified: no.
- Dashboard/OA: still deferred.
- Production: NO-GO.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/ui typecheck`: PASS.
  - `pnpm --filter @xlb/ui build`: PASS.
  - `pnpm --filter @xlb/customer typecheck`: PASS.
  - `pnpm --filter @xlb/customer build`: PASS.
  - `pnpm --filter @xlb/worker typecheck`: PASS.
  - `pnpm --filter @xlb/worker build`: PASS.
  - `pnpm --filter @xlb/admin typecheck`: PASS.
  - `pnpm --filter @xlb/admin build`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
  - `rg -n "Phase 0 Ready" apps/customer apps/worker apps/admin`: PASS, no matches.
  - `rg -n "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client`: PASS, no matches.
  - `rg -n "Settlement Operations|Operations Guardrail|Review Summary|Reconciliation Gap Scan|task pool not-wired|eligibility not-wired|no local sample orders|range|idle|ready" apps/customer apps/worker apps/admin packages/ui`: PASS, no matches.
  - `rg -n "mock|fake|dummy" apps/customer apps/worker apps/admin packages/api-client`: reviewed. Matches are limited to the existing api-client local payment webhook helper and are not used by customer/worker/admin pages to fabricate business records.

## Phase 15.3D Figma Pixel Alignment Repair Pass

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): audit figma pixel alignment gaps`).
- Scope:
  - `docs/reports/PHASE15_3D_FIGMA_PIXEL_ALIGNMENT_REPORT.md`
  - `docs/design/figma/reports/PHASE15_3D_FRAME_EXPORT_INDEX.md`
  - `docs/design/figma/frames/customer/*.png`
  - `docs/design/figma/frames/worker/*.png`
  - `docs/design/figma/frames/admin/*.png`
  - `docs/execution/PHASE15_PROGRESS.md`
- Figma MCP re-read:
  - URL: `https://www.figma.com/design/WrIq7mTPz9zB5EJkftS3sY/Untitled?node-id=0-1&p=f&t=f3lEqJhifRddTPgx-0`
  - Page node: `0:1`
  - Design root: `1:2` / `三端家居维修 App UI`
  - Tools: `get_metadata`, `get_screenshot`
- Newly exported/refreshed route-critical PNGs:
  - Customer CreateOrder / Orders / OrderDetail.
  - Worker GrabHall Online / Paused.
  - Admin Dashboard / WorkOrderPool / Dispatch / MasterAudit / Complaint / AfterSale.
- Audit conclusion:
  - `08e8355` is Figma-inspired rough polish only, not high-fidelity complete.
  - Admin Settlement/Governance routes are `DESIGN_SOURCE_MISSING` in the current Figma file.
  - Customer and worker pages require a follow-up pixel repair code phase before another high-fidelity claim.
- App code modified: no.
- `packages/**` modified: no.
- Backend/db/deploy/infra modified: no.
- Cloud-staging deploy: not performed.
- Production: NO-GO.
- Tags: not created.
- Verification:
  - `git diff --check`: PASS.
  - `git status --short`: scoped to allowed docs/design/report files before commit.
