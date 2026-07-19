# Phase 15 Progress

## Current Status

- Current status target: `THREE_APP_REAL_BUSINESS_UAT_DESIGN_READY`.
- Current subdivision: Phase 15.3V 三端真实业务 UAT 设计交付（Customer/Woker/Admin）。
- Strategy: Local-first only.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3V-1 Three-App Real Business UAT Design Handoff

- Status: completed locally, pending commit.
- Artifact:
  - `docs/reports/PHASE15_3V1_THREE_APP_REAL_BUSINESS_UAT_DESIGN_HANDOFF.md`
- Scope:
  - Product-design handoff only (customer / worker / admin real-business UAT readiness).
- Scope rules kept:
  - No backend/db/deploy/infra changes.
  - No production rollout.
  - No fake/mock/dummy business data.

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
- Resolved by the five-surface constitution: Admin remains a mobile App; desktop harmonization belongs to OA.

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

## Phase 15.3D-SKILL-SPIKE UI UX Pro Max Evaluation

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): evaluate ui ux pro max skill`).
- Scope:
  - `docs/reports/PHASE15_3D_UIUXPROMAX_SKILL_EVALUATION_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Skill installation:
  - Source: `nextlevelbuilder/ui-ux-pro-max-skill`, path `.claude/skills/ui-ux-pro-max`.
  - Installed to `C:\Users\kong\.codex\skills\ui-ux-pro-max`.
  - Install command: `python C:\Users\kong\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo nextlevelbuilder/ui-ux-pro-max-skill --path .claude/skills/ui-ux-pro-max`.
- Repository impact:
  - Third-party skill files were installed outside the repo.
  - No `.gitignore` change required.
  - App code modified: no.
  - `packages/**` modified: no.
  - Backend/db/deploy/infra modified: no.
  - Runtime dependencies modified: no.
- Evaluation conclusion: Adopt with constraints.
- Allowed use:
  - Anti-slop checklist for safe area, fixed bottom navigation, touch targets, semantic HTML, loading/empty/error states, and layout stability.
  - Supplemental review after Figma MCP frame export, route mapping, and browser screenshot comparison.
- Forbidden use:
  - Replacing Figma MCP or local Figma frame PNGs.
  - Generating a new freeform XLB100 design system.
  - Running project-local `--persist` output.
  - Directly editing app pages or `packages/ui`.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3D-SKILL-SPIKE-2 HyperFrames Evaluation

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): evaluate hyperframes skill`).
- Scope:
  - `docs/reports/PHASE15_3D_HYPERFRAMES_SKILL_EVALUATION_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Skill installation:
  - Source: `heygen-com/hyperframes`, path `skills/hyperframes`.
  - Installed to `C:\Users\kong\.codex\skills\hyperframes`.
  - Install command: `python C:\Users\kong\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo heygen-com/hyperframes --path skills/hyperframes`.
- Runtime readiness:
  - Node: `v24.14.0`.
  - npm: `11.9.0`.
  - FFmpeg: `8.1.1`.
- Repository impact:
  - Third-party skill files were installed outside the repo.
  - No `.gitignore` change required.
  - App code modified: no.
  - `packages/**` modified: no.
  - Backend/db/deploy/infra modified: no.
  - Runtime dependencies modified: no.
- Evaluation conclusion:
  - Reject as a Phase 15.3D pixel repair tool.
  - Keep installed only for possible future video/demo/media experiments.
- Reason:
  - HyperFrames is primarily an HTML-to-video / animation workflow router.
  - The installed entry skill does not provide route-to-Figma screenshot pixel comparison.
  - It must not replace Figma MCP, local Figma frame PNGs, browser screenshots, or targeted UI repair.
- Phase 15.3E recommendation:
  - Proceed with Figma frame to browser screenshot pixel repair.
  - Do not use HyperFrames in the UI implementation path.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3E-ARCH Workflow UI Binding Contract

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): add workflow ui binding contract`).
- Scope:
  - `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
  - `docs/reports/PHASE15_3E_WORKFLOW_UI_BINDING_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Architecture conclusion:
  - Backend workflow drives behavior.
  - Figma drives visual expression.
  - `packages/ui` provides reusable presentation components only.
  - Frontend route code binds backend workflow/action state into UI slots.
- Contract coverage:
  - `WorkflowUiBinding`.
  - `ActionContract`.
  - `CustomerAnswerModel`.
  - `FigmaBinding`.
  - `NotWiredPolicy`.
  - Customer/worker/admin workflow mapping.
  - Phase 15.3F pixel repair entry conditions.
- Hard rule:
  - No executable button may come from Figma alone.
  - Every executable or disabled action must come from backend workflow/API contract and include enabled state plus disabled reason policy.
- Figma binding rule:
  - Every route must be marked `exact frame`, `partial frame`, `derived design`, or `DESIGN_SOURCE_MISSING`.
  - Admin Settlement/Governance remain `DESIGN_SOURCE_MISSING` until matching Figma frames exist.
- Repository impact:
  - App code modified: no.
  - `packages/**` modified: no.
  - Backend/db/deploy/infra modified: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3E-ARCH Workflow-driven Figma UI Design Architecture

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): define workflow driven figma ui architecture`).
- Scope:
  - `docs/contracts/CONTRACT_WORKFLOW_UI_BINDING.md`
  - `docs/contracts/CONTRACT_RUNTIME_THEMING_TOKENS.md`
  - `docs/design/ui/PHASE15_WORKFLOW_DRIVEN_UI_DESIGN_MASTER_PLAN.md`
  - `docs/reports/PHASE15_3E_WORKFLOW_FIGMA_THEMING_ARCH_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Architecture:
  - Backend workflow decides state, permissions, available actions, disabled reasons, audit, idempotency, and city scope.
  - Figma decides visual structure, layout, style, density, and interaction expression.
  - `packages/ui` carries components, tokens, themes, state components, and action components.
  - `apps/customer`, `apps/worker`, and `apps/admin` assemble pages, wire APIs, and adapt workflow view models.
- Runtime theming:
  - Added design-token-driven runtime theming contract.
  - Default theme is mandatory safe fallback.
  - City/campaign/festival overrides are visual-only.
  - Themes must not affect order, payment, dispatch, settlement, refund, permissions, city scope, audit, or idempotency.
- Route coverage:
  - Customer: `/customer/`, `/customer/services`, `/customer/order/create`, `/customer/orders`, `/customer/profile`.
  - Worker: `/worker/`, `/worker/tasks`, `/worker/wallet`, `/worker/profile`, `/worker/certification`.
  - Admin: `/admin/`, Settlement/Governance/Export Review/Statement Detail/Governance hash/error/city_scope/audit surfaces.
- Phase 15.3F gate:
  - No Pixel Repair Implementation until workflow -> figma -> uiSlots -> packages/ui -> runtime theme mapping is complete per route.
- Repository impact:
  - App code modified: no.
  - `packages/**` modified: no.
  - Backend/db/deploy/infra modified: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3E-VERIFY Workflow Figma UI Architecture Gate

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): verify workflow figma ui architecture gate`).
- Scope:
  - `docs/reports/PHASE15_3E_WORKFLOW_FIGMA_UI_ARCH_GATE_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Gate result: `PARTIAL GO`.
- Customer routes:
  - `/customer/`, `/customer/services`, `/customer/order/create`, `/customer/orders`, `/customer/profile` may enter constrained Phase 15.3F Pixel Repair after explicit route `WorkflowUiBinding` / `ActionContract` adapters are used.
- Worker routes:
  - `/worker/`, `/worker/tasks`, `/worker/wallet`, `/worker/profile`, `/worker/certification` may enter constrained Phase 15.3F Pixel Repair as not-wired/read-only workflow shells unless real backend action availability is wired.
- Admin routes:
  - `/admin/`, Settlement Ops, Governance, Export Review, Statement Detail, and Governance hash pages remain blocked for high-fidelity Pixel Repair because Settlement/Governance-specific Figma frames are `DESIGN_SOURCE_MISSING`.
  - Existing admin Figma frames may only inform derived shell/table/status styling and must not be promoted to exact settlement/governance frames.
- Action Source Gate:
  - Backend workflow/API contracts remain the required source for executable actions, disabled reasons, city scope, audit, and idempotency.
  - `FRONTEND_ACTION_LEAK` recorded for the current Governance dry-run plan action that uses `packet-placeholder`; Admin pixel repair must not bless or restyle it as an approved workflow action.
- Runtime theming:
  - PASS as architecture. `activeTheme` is visual-only and must not affect order, payment, dispatch, settlement, refund, permissions, city scope, audit, or idempotency.
- Repository impact:
  - App code modified: no.
  - `packages/**` modified: no.
  - Backend/db/deploy/infra modified: no.
  - Production env modified: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3F-0 Customer Worker Workflow UI Binding Adapters

- Status: completed locally, pending commit.
- Commit: this commit (`feat(frontend): add customer worker workflow ui bindings`).
- Scope:
  - `packages/types/**`
  - `packages/ui/**`
  - `apps/customer/**`
  - `apps/worker/**`
  - `docs/reports/PHASE15_3F0_WORKFLOW_UI_BINDING_ADAPTERS_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Added shared workflow UI binding types:
  - `WorkflowUiBinding`
  - `WorkflowActionContract`
  - `WorkflowDisabledReason`
  - `WorkflowUiSlot`
  - `WorkflowActor`
  - `WorkflowFigmaBindingKind`
  - `WorkflowNotWiredPolicy`
- Added `@xlb/ui` workflow expression components:
  - `ActionDock`
  - `WorkflowTimeline`
  - `WorkflowStatePanel`
  - `DisabledReasonText`
  - `CustomerAnswerCard`
  - `WorkerAnswerCard`
  - `RuntimeThemeSurface`
- Customer route adapters:
  - `/customer/`
  - `/customer/services`
  - `/customer/order/create`
  - `/customer/orders`
  - `/customer/profile`
- Worker route adapters:
  - `/worker/`
  - `/worker/tasks`
  - `/worker/wallet`
  - `/worker/profile`
  - `/worker/certification`
- Action source gate:
  - Customer catalog, quote, order create, payment order, and order detail actions are backend/API-derived from existing APIs.
  - Customer order list/profile/address/auth missing APIs remain explicit `not-wired`.
  - Worker task pool, accept, fulfillment, wallet, profile, and certification remain disabled `not-wired`.
  - No frontend-created business action was introduced for Customer / Worker.
- Runtime theming:
  - Theme tokens remain visual-only.
  - Themes do not affect order, payment, dispatch, settlement, refund, permissions, city scope, audit, or idempotency.
- Admin:
  - `apps/admin/**` not modified.
  - Settlement / Governance remain `DESIGN_SOURCE_MISSING` and blocked from Pixel Repair.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/types typecheck`: PASS.
  - `pnpm --filter @xlb/ui typecheck`: PASS.
  - `pnpm --filter @xlb/ui build`: PASS.
  - `pnpm --filter @xlb/customer typecheck`: PASS.
  - `pnpm --filter @xlb/customer build`: PASS.
  - `pnpm --filter @xlb/worker typecheck`: PASS.
  - `pnpm --filter @xlb/worker build`: PASS.
  - Initial `pnpm test -- --bail=1`: BLOCKED by local DB availability. Rerun failed on DB-backed tests with `connect ECONNREFUSED 127.0.0.1:3306`; Docker daemon was unavailable, so local MySQL/Redis could not be started.
  - `rg "Phase 0 Ready" apps/customer apps/worker`: PASS, no matches.
  - `rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker packages/api-client`: PASS, no matches.
  - `rg "mock|fake|dummy" apps/customer apps/worker packages/api-client`: reviewed. Matches are limited to the existing api-client local payment mock-webhook helper and are not used by the Customer / Worker UI bindings.
  - `rg "availableActions|WorkflowUiBinding|ActionContract|not-wired" apps/customer apps/worker packages/types packages/ui`: PASS.
  - `git diff --check`: PASS.
  - changed path scope: PASS; `apps/admin/**`, backend, db, deploy, infra, dashboard, and oa were not modified.

## Phase 15.3F-0-GATE Workflow Binding Root Test Gate

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): record workflow binding root test gate`).
- Goal:
  - Restore Docker daemon.
  - Confirm local MySQL/Redis health.
  - Rerun root test for Phase 15.3F-0 after the previous Docker-blocked run.
- Docker:
  - Docker Desktop daemon restored.
  - `docker compose -f deploy\compose\docker-compose.local.yml up -d`: PASS.
  - No `down -v` was run.
  - No volume was deleted.
- Local services:
  - `xlb-mysql-local`: healthy on `3306`.
  - `xlb-redis-local`: healthy on `6379`.
- Gate repair:
  - Root test initially progressed past DB-backed tests but failed six legacy provider-withdraw UI gate scripts because Phase 15.3F-0 added adapter files under `apps/customer/src/adapters` and `apps/worker/src/adapters`.
  - Updated only the six provider-withdraw security gate scripts to allow the two explicit workflow binding adapter files:
    - `apps/customer/src/adapters/workflowBindings.ts`
    - `apps/worker/src/adapters/workflowBindings.ts`
  - These adapters are workflow/action contract bindings and do not implement settlement/provider-withdraw UI.
- Single gate verification:
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-confirm-no-provider-withdraw-ui.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-payable-no-provider-withdraw-ui.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-settlement-payable-queue-no-provider-withdraw-ui.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-no-provider-withdraw-ui.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`: PASS.
  - `powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`: PASS.
- Root verification:
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
- Scope:
  - `apps/**`: not modified in this gate.
  - `packages/**`: not modified in this gate.
  - `backend/**`: not modified.
  - `db/**`: not modified.
  - `deploy/**`: not modified.
  - `infra/**`: not modified.
  - Provider-withdraw/security gate scripts updated only to recognize Phase 15.3F-0 adapter files.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3F-SKILL-SPIKE Impeccable Evaluation

- Status: completed locally, pending commit.
- Commit: this commit (`docs(phase15): evaluate impeccable design skill`).
- Scope:
  - `docs/reports/PHASE15_3F_IMPECCABLE_EVALUATION_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Tool evaluated: `pbakaus/impeccable`.
- Installation:
  - `npx impeccable --help` downloaded the CLI to npm cache only.
  - `npx impeccable install --help` unexpectedly wrote project-local `.cursor` / `.github` Impeccable files; those generated files were immediately removed.
  - Isolated install was performed at `C:\Users\kong\.codex\impeccable-eval\xlb100-spike` with `npx impeccable install --providers=codex --scope=project`.
  - Isolated install wrote `.agents/skills/impeccable/**` and `.codex/hooks.json` under the isolated directory only.
  - `npx impeccable check` in the isolated directory reported installed skill version `3.9.1` up to date.
- XLB100 repository impact:
  - `.codex/hooks.json`: not installed.
  - `.agents/skills/impeccable`: not installed.
  - `.impeccable`: not created.
  - `.cursor/hooks.json`: not retained.
  - `.github/hooks` / `.github/skills`: not retained.
  - `.gitignore`: not modified because no project `.impeccable` output was retained.
- Trial:
  - `npx impeccable detect --json apps/customer/src/app/App.tsx apps/worker/src/app/App.tsx packages/ui/src/components/index.tsx`: returned `[]`.
  - `npx impeccable detect --json apps/customer/dist/index.html apps/worker/dist/index.html`: returned `[]`.
  - URL detector was blocked because Impeccable requires `puppeteer` for URL scanning; no project dependency was added.
  - Isolated context script against `apps/customer/src/app/App.tsx` returned `NO_PRODUCT_MD`, confirming that Impeccable's default init flow would try to create separate design context.
- Evaluation conclusion: `Adopt with constraints`.
- Allowed use:
  - Figma Pixel Repair reviewer after Figma MCP/local frame comparison.
  - Anti-slop checklist for nested cards, generic AI templates, typography hierarchy, responsive touch targets, bottom-nav/safe-area review, and UX copy polish.
  - Optional deterministic detector through `npx impeccable detect` when it does not add project dependencies.
- Forbidden use:
  - Replacing Figma MCP or `docs/design/figma/**`.
  - Free redesign or new design-system invention.
  - Treating `PRODUCT.md` / `DESIGN.md` as higher authority than Phase 15 contracts and Figma artifacts.
  - Directly editing `apps/**` or `packages/**` through Impeccable in this spike.
  - Installing project `.codex` hooks or `.agents` skills without a separate approval step.
  - Adding `puppeteer` or other project runtime/dev dependencies for this tool.
- Admin:
  - Settlement / Governance remain `DESIGN_SOURCE_MISSING`.
  - Impeccable cannot unblock Admin Figma source gaps.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.

## Phase 15.3T-ARCH Campaign Theme Directory & Runtime Token Architecture

- Status: completed locally, pending commit.
- Commit: this commit (`feat(ui): add campaign theme token architecture`).
- Scope:
  - `docs/contracts/CONTRACT_CAMPAIGN_THEME.md`
  - `docs/design/ui/XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md`
  - `docs/frontend/FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md`
  - `docs/reports/PHASE15_3T_CAMPAIGN_THEME_ARCH_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
  - `packages/types/src/campaign.ts`
  - `packages/types/src/index.ts`
  - `packages/validators/src/campaignSchema.ts`
  - `packages/validators/src/index.ts`
  - `packages/ui/src/tokens/**`
  - `packages/ui/src/index.ts`
- Architecture:
  - Campaign is the only backend source for activity/festival theme activation.
  - Frontend pages must not infer festival/activity dates, hardcode promotion windows, or calculate discounts.
  - `packages/ui` owns only base tokens, theme token registry, CSS variable injection, and safe fallback behavior.
  - `useActiveCampaignTheme` remains outside `packages/ui`; future app-level bridges or `@xlb/api-client` injection must provide active campaign results.
  - Theme switching remains visual-only and must not affect order, payment, dispatch, settlement, refund, permissions, audit, city scope, or idempotency.
- Added shared campaign types:
  - `Campaign`
  - `CampaignStatus`
  - `CampaignAppScope`
  - `CampaignCityScope`
  - `ActiveCampaignRequest`
  - `ActiveCampaignResponse`
  - `CampaignThemeId`
- Added validators:
  - `campaignSchema`
  - `campaignStatusSchema`
  - `campaignThemeIdSchema`
  - `campaignCityScopeSchema`
  - `campaignAppScopeSchema`
  - `activeCampaignRequestSchema`
  - `activeCampaignResponseSchema`
- Added `@xlb/ui` token skeleton:
  - `base/defaultTokens.ts`
  - `themes/default.theme.json`
  - `themes/spring-festival.theme.json`
  - `themes/double11.theme.json`
  - `themes/themeDefinitions.ts`
  - `themeRegistry.ts`
  - `tokenTypes.ts`
  - `ThemeProvider.tsx`
- Backend/db/deploy/infra modified: no.
- App route business flows modified: no.
- Production: NO-GO.
- Cloud-staging deploy: not performed.
- Tags: not created.
- Verification:
  - `pnpm --filter @xlb/types typecheck`: PASS.
  - `pnpm --filter @xlb/validators typecheck`: PASS.
  - `pnpm --filter @xlb/ui typecheck`: PASS.
  - `pnpm --filter @xlb/ui build`: PASS.
  - `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.
- Safety checks:
  - `rg "new Date\\(|春节|双11|国庆|中秋|festival|holiday|campaign" apps/customer apps/worker apps/admin packages/ui`: PASS. Matches are limited to required `spring-festival` token id registration in `packages/ui`; no app page date or festival decision logic was found.
  - `rg "discount|折扣" apps/customer apps/worker apps/admin packages/ui`: PASS, no matches.
  - `rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" packages/ui packages/types packages/validators`: PASS, no matches.

## Phase 15.3F-2-MOBILE-SHELL-GATEFIX Customer Real Mobile Shell

- Status: completed locally, pending verification and commit.
- Commit: this commit (`fix(customer): use real mobile app shell on phones`).
- Scope:
  - `apps/customer/**`
  - `packages/ui/**`
  - `docs/reports/PHASE15_3F2_CUSTOMER_UAT_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Problem:
  - Cloud-staging showed the Figma phone device preview inside real mobile browsers.
  - Real phones saw a fake phone frame, fake status bar, gold border, and preview margins.
- Fix:
  - Added `MobileShell` modes: `desktop` / `preview` and `mobile` / `app`.
  - Added `BottomNav` fixed placement support for app mode.
  - Customer now detects mobile/touch viewport and switches to real app shell.
  - Mobile/touch shell removes the gold device frame, fake status bar, preview margins, rounded frame, and shadow.
  - Mobile/touch shell uses `100vw`, `100dvh`, and fixed bottom nav with safe-area padding.
- Customer business flow:
  - catalog unchanged.
  - pricing unchanged.
  - order create unchanged.
  - payment order create unchanged.
  - order detail re-read unchanged.
  - UAT folded panel retained.
- Forbidden areas:
  - `apps/worker/**`: not modified.
  - `apps/admin/**`: not modified.
  - backend/db/deploy/infra: not modified.
  - production: not deployed.
  - tag: not created.

## Phase 15.3M Customer Mobile App Shell Readiness

- Status: completed locally, pending commit.
- Scope:
  - `apps/customer/capacitor.config.ts`
  - `apps/customer/public/manifest.webmanifest`
  - `apps/customer/public/icons/customer-icon-192.svg`
  - `apps/customer/public/icons/customer-icon-512.svg`
  - `docs/mobile/CUSTOMER_CAPACITOR_READINESS.md`
  - `docs/mobile/APP_SHELL_DECISION.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Goal:
  - Establish app-shell readiness artifacts for future Capacitor packaging without changing runtime business logic.
- Notes:
  - Capacitor config uses `appId: com.xlb100.customer`, `appName: 喜乐帮到家`, `webDir: dist`.
  - No hard-coded staging server URL is written.
  - Documentation clarifies that Capacitor is a WebView shell and does not solve UI design or acceptance quality by itself.
  - Desktop Figma preview mode and real mobile app mode are explicitly separated in documentation.
- Preconditions listed for future `npx cap add ios/android`:
  - Customer main flow UAT passes on staging.
  - Mobile shell no longer renders fake phone frame.
  - HTTPS domain prepared.
  - Icons/splash prepared.
  - Privacy policy prepared.
  - Android Studio env prepared.
  - iOS requires macOS/Xcode or cloud build flow.
- Forbidden areas:
  - `apps/worker/**`: no changes.
  - `apps/admin/**`: no changes.
  - `backend/**`, `db/**`, `deploy/**`, `infra/**`: no changes.
  - Production deployment: no.
  - tag: not created.

## Phase 15.3M-GATEFIX Customer Capacitor Asset Security Gatefix

- Status: completed locally, pending commit.
- Scope:
  - `scripts/check-settlement-confirm-no-provider-withdraw-ui.ps1`
  - `scripts/check-settlement-payable-no-provider-withdraw-ui.ps1`
  - `scripts/check-settlement-payable-queue-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
  - `docs/reports/PHASE15_3M_CUSTOMER_CAPACITOR_SECURITY_GATEFIX_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Root test symptom:
  - `pnpm test -- --bail=1` failed at Phase 8x gates (8C/8D/8E/8F/8G/8H) due to false-positive security gate filtering.
  - New readiness artifacts in `apps/customer/capacitor.config.ts`, `apps/customer/public/manifest.webmanifest`, and `apps/customer/public/icons/*` were not in legacy allowlist.
- Fix applied:
  - Minimal precision allowlist added only for the above readiness files.
  - `apps/customer/public/icons/*` allowed for icon directory.
  - File suffix filter extended to include `tsx?`, `jsx?`, `ts`, `json`, `svg` so non-code assets in legacy scanning paths no longer cause unrelated misses.
- Verification:
  - `pnpm --filter @xlb/customer typecheck`: PASS
  - `pnpm --filter @xlb/customer build`: PASS
  - `pnpm test -- --bail=1`: PASS (255 test files, 1048 tests)
  - `git diff --check`: PASS
- Safety checks:
  - No production/db/deploy/infra code touched.
  - No `server.url` / localhost staging hardcode / credential fields found in readiness artifacts.
  - Security gate script checks remain in place with narrower, targeted allowlist.

## Phase 15.3U Frontend UI System Layers

- Status: completed locally, pending commit.
- Scope:
  - docs/contracts/CONTRACT_FRONTEND_UI_SYSTEM_LAYERS.md
  - docs/contracts/CONTRACT_CAMPAIGN_THEME.md
  - docs/design/ui/XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md
  - docs/frontend/FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md
  - packages/ui/COMPONENT_MANIFEST.md
  - docs/reports/PHASE15_3U_FRONTEND_UI_SYSTEM_LAYERS_REPORT.md
  - docs/execution/PHASE15_PROGRESS.md
- Goal:
  - Define contracted UI system layers (backend facts -> workflow binding -> campaign/theme -> packages/ui -> app route pages).
- Key decisions:
  - Adapter is the unique business translation layer.
  - ThemeProvider is visual-only, no backend requests.
  - Campaign controls ctiveTheme/banner only.
  - packages/ui remains presentation components + token runtime, not business modules.
- Forbidden actions:
  - No UI code implementation.
  - No backend campaign/API implementation.
  - No deployment, no tags.
- Current status:
  - docs-only completion in progress.

## Phase 15.3F-3 Customer Header Search and Quantity UX Fix

- Status: completed locally, committed (`fix(customer): improve location search and quantity ux`).
- Scope:
  - `packages/ui/src/components/index.tsx`
  - `apps/customer/src/app/App.tsx`
  - `docs/reports/PHASE15_3F3_CUSTOMER_HEADER_QUANTITY_UX_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Goal:
  - Fix C 端首页城市/搜索入口体验与下单页数量与服务路径表达。
- Changes:
  - Added UI components `LocationSearchBar` and `QuantityStepper` to `@xlb/ui`.
  - `/customer/`:
    - Replaced bottom duplicate 城市卡片 with integrated city + search entry.
    - Header now renders city chip + search in one entry point; supports city switching via existing `selectedCityCode` path.
    - Search placeholder updated to `搜保洁、维修、搬家、月嫂`.
  - `/customer/order/create`:
    - Replaced number input with `QuantityStepper` (min-lock at 1, no empty state).
    - Added “更换服务” quick return action.
    - Service option/subtitle labels now de-duplicate repeated hierarchical path text.
  - `/customer/services`:
    - Service card subtitles aligned to deduplicated category+sub-category structure.
- Business constraints:
  - Real chain kept: catalog → pricing → order → payment order → order detail.
  - No fake orders/user/payment/dispatch introduced.
  - No changes in `apps/worker/**`, `apps/admin/**`, backend/db/deploy/infra.
- Verification:
  - `pnpm --filter @xlb/ui typecheck`: PASS
  - `pnpm --filter @xlb/ui build`: PASS
  - `pnpm --filter @xlb/customer typecheck`: PASS
  - `pnpm --filter @xlb/customer build`: PASS
  - `pnpm test -- --bail=1`: PASS (`255` test files, `1048` tests, `1` todo)
  - `rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer packages/ui packages/api-client`: PASS
  - `git diff --check`: PASS


## Phase 15.3V Customer Unified Location Search Bar

- Status: completed locally, pending commit.
- Scope:
  - `packages/ui/src/components/index.tsx`
  - `apps/customer/src/app/App.tsx`
  - `docs/reports/PHASE15_3V_CUSTOMER_SERVICE_DISCOVERY_UI_SLICE_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Goal:
  - Unify customer home header into a single location-search pill (city + search in one row).
  - Remove duplicated city card in the home main flow.
  - Keep `/customer/` data flow on real catalog search/filter and existing city selection state.
- Changes:
  - Refactored `LocationSearchBar` to a one-row, pill-style component with:
    - left city slot + dropdown chevron,
    - divider,
    - right search input + rightmost icon,
    - default height around `52px`,
    - city section width cap at `35%`.
  - Updated `/customer/` header usage:
    - `cityLabel` now uses selected city code (`hangzhou` / `shanghai` / `beijing`),
    - `areaLabel` uses `cityAreaByCode[cityCode]` (e.g., `静安区`), avoiding fake location-accuracy claims.
  - Removed explicit “服务城市” card from home primary cards.
  - Kept city switching via existing `selectedCityCode` path with a compact in-place selector when expanded.
- Verification:
  - `pnpm --filter @xlb/ui typecheck`: PASS
  - `pnpm --filter @xlb/ui build`: PASS
  - `pnpm --filter @xlb/customer typecheck`: PASS
  - `pnpm --filter @xlb/customer build`: PASS
  - `pnpm test -- --bail=1`: PASS (`255` test files, `1048` tests, `1` todo)
  - `git diff --check`: PASS
  - `git status --short`: shows only scope files for this phase
- Safety:
  - No worker/admin/backend/db/deploy/infra changes.
  - No production deployment.
  - No new dependencies.

## Phase 15.3V-1 Customer Backend Contract Traceability & UAT Field Mapping (Docs Only)

- Status: completed locally, docs-only, no code changes.
- Scope:
  - `docs/reports/PHASE15_3V1_CUSTOMER_BACKEND_UI_CONTRACT_MAP.md`
  - `docs/reports/PHASE15_3V1_CUSTOMER_UAT_FIELD_TRACEABILITY.md`
- Deliverable:
  - Added UAT field traceability mapping for required inspection fields.
  - Added `CONTRACT_MISSING` gap list (catalog search, pricing split fields, workflow state/action provenance, payment status stream, order list scope).
  - Documented UAT可见与用户面默认隐藏字段边界。
- Safety:
  - No backend/db/deploy/infra/app code changes.
  - No tags, no deployment, production NO-GO.
- Verification:
  - 文档更新完成，仅为只读扫描与映射补齐。

## Phase 15.3V-1 Customer UAT Review Checklist (Docs Only)

- Status: completed locally, docs-only, no code changes.
- Scope:
  - `docs/reports/PHASE15_3V1_CUSTOMER_UAT_REVIEW_CHECKLIST.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Deliverable:
  - Translated contract map + field traceability into executable field-level UAT checklist.
  - Added route-level acceptance steps for `/customer/`, `/customer/services`, `/customer/order/create`.
  - Added explicit CONTRACT_MISSING enforcement checks (search, pricing split fields, workflow provenance, payment status completeness, order list scope).
  - Added staging UAT runbook order and PASS criteria.
- Safety:
  - No backend/db/deploy/infra/app code changes.
  - No deployment, no tags, production NO-GO.

## Phase 15.3V-1 Customer Service Discovery & Order Entry UI Slice (Route Implementation)

- Status: completed locally, pending this commit.
- Goal:
  - Implement `/customer/` -> `/customer/services` -> `/customer/order/create` with real catalog/pricing/order/payment order-detail flow.
  - Remove home double city card and keep one integrated city-search bar.
  - Keep all behavior contract-driven and contract-gap explicit in UAT.
- Scope:
  - `apps/customer/src/pages/CustomerHomePage.tsx`
  - `apps/customer/src/pages/CustomerServicesPage.tsx`
  - `apps/customer/src/pages/CustomerOrderCreatePage.tsx`
  - `apps/customer/src/app/App.tsx`
  - `apps/customer/src/pages/customerPageShell.tsx`
  - `apps/customer/src/adapters/catalogAdapters.ts`
  - `packages/ui/src/components/index.tsx`
  - `docs/execution/PHASE15_PROGRESS.md`
- Constraint mode:
  - Backend: read-only contract usage only.
  - No fake services/orders/payment/dispatch.
  - No worker/admin/backend/db/deploy/infra modifications.
  - No production deployment.
- Notes:
  - `/customer/services` now reads and updates `q` query and applies local filtering when `/api/catalog/search` is unavailable.
  - `/customer/order/create` now defaults to selected catalog SKU and blocks quantity below 1.
  - UAT panels now include trace fields for `searchMode`, `matchedSkuCount`, `selectedSkuId`, `selectedSkuName`, `createOrderPayload`, and route state/action metadata.
  - `/customer/order/create` now de-duplicates option list by service name for stable service selection and uses deduplicated catalog display labels (title/subtitle) to avoid repeated text.

## Phase 15.3V-1A Root Test Gate Scope Repair

- Status: completed locally, pending this commit.
- Commit target: `fix(security): narrow provider withdraw ui gate scope`
- Scope:
  - `scripts/check-settlement-confirm-no-provider-withdraw-ui.ps1`
  - `scripts/check-settlement-payable-no-provider-withdraw-ui.ps1`
  - `scripts/check-settlement-payable-queue-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-export-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-no-provider-withdraw-ui.ps1`
  - `scripts/check-worker-receivable-statement-review-no-provider-withdraw-ui.ps1`
  - `docs/reports/PHASE15_3V1_ROOT_TEST_GATE_FIX_REPORT.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Rationale:
  - Previous failures were false positives from gate scope drift (`apps/customer apps/worker apps/admin` all-in).
  - Gate scanners are now restricted to the actual settlement/receivable admin UI scope and exclude Customer service-entry files (`/customer/*`) by design.
- Verification:
  - `pnpm --filter @xlb/ui typecheck`: PASS
  - `pnpm --filter @xlb/ui build`: PASS
  - `pnpm --filter @xlb/customer typecheck`: PASS
  - `pnpm --filter @xlb/customer build`: PASS
  - `pnpm test`: PASS (255 passed, 1 todo)
  - `pnpm exec vitest run tests/security/settlementConfirmNoProviderWithdrawUi.test.ts --passWithNoTests`: PASS (1/1)
  - `pnpm exec vitest run tests/security/settlementPayableGates.test.ts --passWithNoTests`: PASS (1/1, 9 assertions)
  - `pnpm exec vitest run tests/security/settlementPayableQueueGates.test.ts --passWithNoTests`: PASS (1/1, 9 assertions)
  - `pnpm exec vitest run tests/security/workerReceivableStatementExportGates.test.ts --passWithNoTests`: PASS (1/1, 9 assertions)
  - `pnpm exec vitest run tests/security/workerReceivableStatementGates.test.ts --passWithNoTests`: PASS (1/1, 9 assertions)
  - `pnpm exec vitest run tests/security/workerReceivableStatementReviewGates.test.ts --passWithNoTests`: PASS (1/1, 9 assertions)
- Safety:
  - No app/backend/db/deploy/infra edits.
  - No fake settlement, fake receivable, or provider-withdraw behavior introduced.
  - Production remains NO-GO.

## Phase 15.3V-1B Worker/Admin Real Business UAT Readiness Scan

- Status: completed locally, pending commit.
- Baseline evidence:
  - `2125aa7 docs(uat): record root test gate triage`.
- Scope:
  - `docs/reports/PHASE15_3V1_WORKER_ADMIN_REAL_BUSINESS_UAT_SCAN.md`
  - `docs/execution/PHASE15_PROGRESS.md`
- Objective:
  - Read-only validation scan for Admin/Worker real-business UAT readiness based on existing routes, api-client contracts, and backend endpoints.
- Findings:
  - Admin coverage is currently settlement/governance-oriented and does not provide customer order/detail routes by orderId.
  - Worker app is a guarded workflow shell: task/fact/action routes are defined but UI execution is intentionally not wired.
  - CONTRACT_MISSING and UAT_BLOCKER items were recorded explicitly for order traceability and task execution paths.
- Safety:
  - No Worker/Admin app implementation changes in this phase.
  - No backend/db/deploy/infra edits.
  - No mock/fake/dummy behavior introduced.
  - production NO-GO.
- Test/validation status:
  - `pnpm test`: PASS baseline (`255 passed / 1 todo`) was retained during this scan phase.
- Exit target:
  - Worker/Admin docs-only scan complete.
  - Real-business implementation remains blocked until explicit next knife and UAT handoff follow-up.
