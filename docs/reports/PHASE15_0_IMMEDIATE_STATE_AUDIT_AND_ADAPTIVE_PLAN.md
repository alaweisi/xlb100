# Phase 15.0 Immediate State Audit and Adaptive Construction Plan

Date: 2026-07-06
Branch: main
HEAD: e112d3f2d0b2c2d5a27dbcee9647e56f971028e0

## 1. Executive Summary

Phase 15.0 is a read-first audit and plan freeze. It does not approve production, does not create production environment state, and does not change business code.

Current repo facts:

- `apps/` contains five frontend app directories: `customer`, `worker`, `admin`, `dashboard`, `oa`.
- `customer` and `worker` are still Phase 0 Ready shells.
- `admin` has real settlement/governance pages and hash routing, but the worktree contains an uncommitted API base hotfix that must be isolated before more UI work.
- `dashboard` and `oa` are package/README placeholders only. They have no Vite app, no `src`, and no UI.
- `packages/ui` is still a scaffold. It only exports `tokens`; `components` and `layouts` contain README placeholders.
- `packages/api-client` has customer, worker, admin, ledger, settlement, governance, planner, and preparation-adjacent helpers, but no dashboard or OA clients.
- Backend has many real domain modules through settlement, governance, preparation, aftersale refund, and ledger reversal, but dashboard/OA-specific API surfaces are absent.
- Browser E2E/UAT gates are not present in the repo. Current frontend tests are jsdom unit tests for admin settlement pages only.
- Production remains NO-GO.

## 2. Why Phase 15 Is Reasonable

Phase 15 is reasonable because the repo has outgrown the older "three app shell" assumption:

- The filesystem now includes `dashboard` and `oa`, but architecture/current-state documents still describe the main product as three apps.
- The cloud-staging proxy only routes `customer`, `worker`, and `admin`.
- UI implementation maturity is uneven: admin has real pages, customer/worker are placeholders, dashboard/oa are placeholders, and `packages/ui` has no real components.
- Continuing to build pages without freezing API base rules, route rules, and shared UI primitives would multiply duplicated inline UI and deployment-specific API mistakes.

## 3. Relationship to the Mandatory Roadmap

The user-requested mandatory SDJ99 files were checked and are not present in this repo:

- `docs/00_SDJ99_MASTER_ARCHITECTURE_MANDATORY.md` missing
- `docs/01_SDJ99_PRODUCTION_IMPLEMENTATION_ROADMAP.md` missing
- `docs/02_SDJ99_MODULE_BOUNDARY_AND_PLUGIN_DESIGN.md` missing
- `docs/03_SDJ99_P0_EXECUTION_CHECKLIST.md` missing

Current repo authority is therefore:

- `AGENTS.md`
- `docs/CURRENT_STATE.md`
- `docs/architecture/00_XLB_ENGINEERING_ARCHITECTURE_MANDATORY.md`
- `docs/architecture/02_XLB_ENGINEERING_FOUNDATION.md`
- actual git tree

Important conflict/risk: current repo rules explicitly forbid new `sdj99` / `@sdj99` naming and define the package prefix as `@xlb/*`. Any Phase 15 work must keep XLB package names unless the owner explicitly opens a rename/migration phase.

## 4. Phase 15 Redline Summary

- `city_code`: all business APIs and persistence remain city-scoped. No UI may hide or bypass required city context.
- `city_scope`: admin/operator/auditor access must stay scoped. Global admin still requires explicit city filtering.
- `RequestContext`: backend routes must continue to derive app type, role, city, user, trace, and request metadata from the request context middleware.
- `ScopedExecutor`: business repository access must continue to assert city scope instead of using unscoped data access.
- `adminQueryGuard`: admin list/detail APIs must continue to reject missing or cross-city scope.
- Payment webhook: payment callback behavior is already guarded by idempotency and event outbox tests. Phase 15 UI must not alter webhook execution.
- Payment metadata snapshot: payment order metadata includes order, city, SKU, price rule, and customer snapshot. UI must not recompute this client-side.
- Ledger: ledger accrual/reversal and audit proof chain are load-bearing. Do not change ledger, refund, reversal, or audit flows in Phase 15.0.
- Redis city stream: dispatch stream naming and city stream tests exist. UI work must not introduce national/global stream assumptions.
- `audit_log` / audit trail: audit evidence currently lives through event/audit tables and governance/preparation/ledger audit routes. Do not fake audit summaries in UI.
- Minimum app closure: customer and worker need real route shells and eventually real business flows; admin needs unified shell; dashboard/oa need API truth before UI.
- UI ordering: do not replace "Phase 0 Ready" with another fake page. Shared UI primitives and API base/route rules must be settled before real page construction.

## 5. Current Repo Five-App Matrix

| App | package.json | vite.config.ts | src/main.tsx | src/app or routes | Real UI | Placeholder | Phase 0 Ready | @xlb/ui | @xlb/api-client | Hardcoded localhost | API base | Tests |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| customer | yes | yes | yes | `src/app/App.tsx`, README dirs | no | yes | yes | imports tokens | no | no app hardcode | no | none app-specific |
| worker | yes | yes | yes | `src/app/App.tsx`, README dirs | no | yes | yes | imports tokens | no | no app hardcode | no | none app-specific |
| admin | yes | yes | yes | `src/app/App.tsx`, pages, hash params | partial settlement/governance | partly | no current Phase 0 Ready hit | dependency/alias, no source import | yes | dirty fix removed `http://localhost:3000` in pages | dirty `API_BASE = VITE_API_BASE || "/api"` | admin page jsdom unit tests |
| dashboard | yes | no | no | no `src` | no | yes | no rendered app | no | no | no | no | none |
| oa | yes | no | no | no `src` | no | yes | no rendered app | no | no | no | no | none |

## 6. Customer Current State

Key files:

- `apps/customer/package.json`
- `apps/customer/vite.config.ts`
- `apps/customer/src/main.tsx`
- `apps/customer/src/app/App.tsx`
- README placeholders under `src/pages`, `src/routes`, `src/features`, `src/adapters`

Findings:

- It is a Vite React app on port 5173.
- It imports `tokens` from `@xlb/ui`.
- It imports `AppType` from `@xlb/types`.
- It does not import `@xlb/api-client`.
- It displays `Phase 0 Ready`.
- It has no real customer routes, catalog/pricing/order/payment UI, empty/error/loading states, or tests.

## 7. Worker Current State

Key files:

- `apps/worker/package.json`
- `apps/worker/vite.config.ts`
- `apps/worker/src/main.tsx`
- `apps/worker/src/app/App.tsx`
- README placeholders under `src/pages`, `src/routes`, `src/features`, `src/adapters`

Findings:

- It is a Vite React app on port 5174.
- It imports `tokens` from `@xlb/ui`.
- It imports `AppType` from `@xlb/types`.
- It does not import `@xlb/api-client`.
- It displays `Phase 0 Ready`.
- It has no task pool, accept, certification, fulfillment, wallet/ledger, route, or state UI.

## 8. Admin Current State

Key files:

- `apps/admin/package.json`
- `apps/admin/vite.config.ts`
- `apps/admin/src/main.tsx`
- `apps/admin/src/app/App.tsx`
- `apps/admin/src/hashParams.ts`
- `apps/admin/src/pages/SettlementOpsPage.tsx`
- `apps/admin/src/pages/SettlementStatementDetailPage.tsx`
- `apps/admin/src/pages/SettlementExportReviewPage.tsx`
- `apps/admin/src/pages/SettlementActionGovernancePage.tsx`

Findings:

- It is a Vite React app on port 5175.
- It aliases `@xlb/api-client` and `@xlb/ui`.
- It imports and uses `@xlb/api-client`.
- It has hash-based routing implemented manually.
- It has real settlement and governance views.
- It uses page-local HTML/inline styles rather than `packages/ui`.
- Current dirty work replaces hardcoded `http://localhost:3000` with `API_BASE`.
- `API_BASE` currently defaults to `/api`, while `packages/api-client` method paths already start with `/api/...`; this creates a possible `/api/api/...` risk unless verified/fixed.
- There is no AdminShell, TopBar, SideNav, shared loading/error/empty primitives, or browser UAT.

## 9. Dashboard Current State

Key files:

- `apps/dashboard/package.json`
- `apps/dashboard/README.md`

Findings:

- Placeholder only.
- No Vite config.
- No `src/main.tsx`.
- No routes/pages/features.
- No `@xlb/ui` or `@xlb/api-client`.
- No dashboard API client.
- No backend metrics API dedicated to dashboard.
- Do not build a fake dashboard page until metrics contracts exist.

## 10. OA Current State

Key files:

- `apps/oa/package.json`
- `apps/oa/README.md`

Findings:

- Placeholder only.
- No Vite config.
- No `src/main.tsx`.
- No routes/pages/features.
- No `@xlb/ui` or `@xlb/api-client`.
- No OA API client.
- No backend OA workflow/task/notification API.
- Do not build a fake OA page until contracts exist.

## 11. packages/ui Current State

Key files:

- `packages/ui/package.json`
- `packages/ui/tsconfig.json`
- `packages/ui/src/index.ts`
- `packages/ui/src/tokens/index.ts`
- `packages/ui/src/components/README.md`
- `packages/ui/src/layouts/README.md`

Findings:

- Current status: scaffold only.
- Current export: `tokens` only.
- Tokens exist but are minimal: brand, primary/background/text colors, sm/md/lg spacing.
- Tokens are enough for Phase 0 inline shell styling, not enough for five-app MVP UI.
- `components` has no real component source, only README.
- `layouts` has no real layout source, only README.
- React TSX is not currently configured in `packages/ui`; tsconfig includes `src/**/*`, but package has no React dependency, no TSX components, and no JSX settings specific to UI.
- Scripts: `build`, `typecheck`, `lint` placeholder. No `test` script.

Minimum required Design System MVP:

- primitives: `Button`, `Card`, `Input`, `Select`, `Textarea`, `FormField`
- data display: `Badge`, `StatusTag`, `Table`, `PriceText`, `Timeline`
- overlays/feedback: `Modal`, `Drawer`, `Toast`, `EmptyState`, `ErrorState`, `LoadingState`, `Skeleton`
- shells/navigation: `PageShell`, `MobileShell`, `AdminShell`, `BottomNav`, `TopBar`, `SideNav`

Ordering recommendation:

- First isolate/fix API base and route base risk for admin hotfix.
- Then build Design System MVP before replacing customer/worker placeholders or normalizing admin.

## 12. packages/api-client Current State

Key files:

- `packages/api-client/src/createApiClient.ts`
- `packages/api-client/src/index.ts`
- `packages/api-client/src/customer.ts`
- `packages/api-client/src/worker.ts`
- `packages/api-client/src/admin.ts`
- no `packages/api-client/src/dashboard.ts`
- no `packages/api-client/src/oa.ts`

Base URL behavior:

- `createApiClient({ baseUrl })` trims one trailing slash from `baseUrl`.
- Request paths are joined as `baseUrl + path`.
- It does not default to `/api`.
- It does not de-duplicate `/api`.
- Because most API helpers pass paths beginning with `/api/...`, callers should generally pass origin/root (`""` or absolute origin), not `/api`.
- Passing `baseUrl: "/api"` can produce `/api/api/...`.

Current client methods:

- customer: create order, get order, create payment order, mock payment success.
- worker: accept task, list fulfillments, get fulfillment, start fulfillment, complete fulfillment.
- admin: settlement wrapper only.
- settlement: prepare, list batches/items, confirm, statement audit, export audit, review summary, settlement audit summary, reconciliation gap scan.
- ledger: run once, list accruals.
- governance: intent, review, evidence, readiness, planner helpers.
- dashboard: none.
- oa: none.

App/client gaps:

- customer has API client methods but customer app does not use them.
- worker has API client methods but worker app does not use them.
- admin uses API client but still has API base risk in dirty work.
- dashboard has neither API client nor UI.
- oa has neither API client nor UI.

## 13. Backend API Connectability Table

| Domain | Backend status | Frontend connectability |
| --- | --- | --- |
| context | real RequestContext middleware and debug context | all real apps must use required headers |
| gateway | app type/role guard exists for customer, worker, admin, oa, dashboard | backend recognizes five app types at guard level |
| city | city resolver/router/scope resolver exist | usable as scope foundation |
| cityConfig | `/api/city-config/current` | customer/admin can read; admin mutations depend on route details and scope |
| catalog | `/api/catalog` | customer can read official catalog |
| pricing | `/api/pricing/quote` | customer can price selected SKU |
| order | `/api/orders`, `/api/orders/:id` | customer can create/read orders |
| payment | `/api/payments/orders`, `/api/payments/mock-webhook` | customer payment MVP possible in mock/provider-limited mode |
| dispatch | `/api/dispatch/tasks`, `/api/internal/dispatch/run-once` | admin/internal can inspect/run dispatch; worker receives via task pool |
| worker | task pool, accept routes | worker can list queued tasks and accept |
| compliance | certifications and eligibility | worker/admin certification flow exists |
| fulfillment | worker fulfillment list/detail/start/complete | worker fulfillment MVP possible |
| ledger | internal run/accruals/reversal | admin/internal only; do not alter in Phase 15.0 |
| settlement | internal settlement/readiness/audit routes | admin has existing partial UI |
| governance/planner/preparation | governance and dry-run/preparation APIs exist | admin governance UI partially wired |
| aftersale | refund module and routes exist despite README placeholder | customer/admin could connect later, but refund/reversal chain is redline now |
| audit | README placeholder plus audit behavior through event/audit routes | no standalone audit module UI should be faked |
| providers | README placeholder | no real provider UI should be built |
| observability | `/health`, `/api/system/status`, `/api/system/db-health` | dashboard can only use basic health today |

Application API judgement:

- customer can connect to city config, catalog, pricing, order, payment, and aftersale refund only if Phase scope allows. No profile API was found.
- worker can connect to worker city binding/profile service, certification, task pool, accept, and fulfillment. Wallet/ledger summary API was not found as worker-facing UI API.
- admin can connect to certification review, dispatch, ledger/settlement/governance/preparation, city config, catalog/pricing/order/payment depending on existing routes. No broad admin orders/workers/payment records console client exists yet.
- dashboard can connect only to system health/db-health/status today. Order/dispatch/payment/ledger/city metrics APIs were not found and must be treated as gaps.
- OA has no internal workflow, approvals, tasks, or notifications API found. Treat as gap; do not fake.

## 14. Test Coverage Current State

Test directories present:

- `tests/unit`
- `tests/integration`
- `tests/contract`
- `tests/security`

Not present:

- `tests/e2e`
- `tests/smoke`
- `playwright.config.ts`
- `cypress.config.ts`

Coverage findings:

- Strong backend/unit/integration/contract/security coverage exists for RequestContext, city scope, catalog/pricing, order/payment, dispatch, worker, fulfillment, ledger, settlement, governance, preparation, aftersale refund/reversal, and gates.
- Frontend coverage exists mainly for admin settlement/governance pages via Vitest + jsdom + Testing Library.
- `packages/ui` has no tests.
- customer and worker frontend apps have no real app tests.
- dashboard and oa have no frontend tests.
- No Playwright/Cypress browser tests were found.
- No repo-level no-localhost-request gate was found.
- No no-Phase-0-Ready gate was found.
- No route refresh/browser reload gate was found.
- No real five-app browser UAT gate was found.

## 15. Cloud-Staging Current State

Local repo-proven facts:

- `infra/nginx/cloud-staging.conf` routes `/customer/`, `/worker/`, `/admin/`, `/api/`, and `/health`.
- It does not route `/dashboard/` or `/oa/`.
- `deploy/compose/docker-compose.staging.yml` builds only backend, customer, worker, admin, mysql, redis, and reverse proxy.
- Raw backend/frontend/data ports are host-bound to `127.0.0.1`, while Nginx exposes HTTP port 80.
- Release docs record Tencent Cloud staging work around release `3f650ae`.

Known external facts from prior supplied context:

- Tencent Cloud public IP: `123.207.198.136`.
- Release path: `/opt/xlb100/releases/3f650ae`.
- `/health` returned 200.
- `/api/system/db-health` returned 200.
- `/customer/`, `/worker/`, `/admin/` returned 200.
- customer/worker still showed Phase 0 Ready.
- admin had real modules but had a Failed to fetch problem before the dirty API base fix.

Needs SSH proof:

- What commit is currently deployed.
- Whether dirty API base fix is deployed.
- Current container image IDs and compose state.
- Whether dashboard/oa are intentionally excluded or merely absent.

Needs browser DevTools proof:

- Whether admin network requests currently hit `/api/api/...`, `/api/...`, or `http://localhost:3000`.
- Whether route refresh works under `/admin/`.
- Whether customer/worker still display Phase 0 Ready on the live host after cache invalidation.

## 16. Current Dirty Worktree Risk

Dirty files:

- `apps/admin/src/pages/SettlementActionGovernancePage.tsx`
- `apps/admin/src/pages/SettlementExportReviewPage.tsx`
- `apps/admin/src/pages/SettlementOpsPage.tsx`
- `apps/admin/src/pages/SettlementStatementDetailPage.tsx`
- `apps/admin/src/apiBase.ts` untracked

Diff summary:

- Four admin pages replace `createApiClient({ baseUrl: "http://localhost:3000" })` with `createApiClient({ baseUrl: API_BASE })`.
- New `apiBase.ts` defines `API_BASE = import.meta.env.VITE_API_BASE || "/api"`.

Assessment:

- Dirty scope matches the known admin API_BASE fix area.
- Do not modify these dirty files in Phase 15.0.
- The default `"/api"` is likely unsafe with current api-client path conventions because helper paths already start with `/api`.
- This should be isolated as a hotfix before broader UI work.

## 17. Real Gap List

- Missing mandatory SDJ99 docs named in prompt; current repo has XLB docs instead.
- Five-app reality is not reflected in core architecture/current-state docs.
- customer/worker still placeholders.
- dashboard/oa are placeholders without Vite/runtime.
- cloud-staging excludes dashboard/oa.
- `packages/ui` has no real components/layouts.
- admin style and layout are page-local and inconsistent.
- API base contract is not frozen; `/api/api` risk exists.
- customer/worker apps do not use `@xlb/api-client`.
- dashboard/oa API clients are missing.
- dashboard metrics APIs are missing.
- OA workflow APIs are missing.
- frontend browser UAT is missing.
- no guard prevents shipping `Phase 0 Ready` text.
- no guard prevents frontend localhost requests.
- no route refresh gate for subpath deployment.

## 18. Immediate Fix Items

1. Isolate and commit or revise the admin API base hotfix as its own phase/hotfix.
2. Freeze frontend API base rule: if api-client methods include `/api/...`, app base must be origin/root, not `/api`.
3. Add a no-localhost frontend request gate before further UI rollout.
4. Add a no-Phase-0-Ready gate before replacing customer/worker shells.
5. Build `packages/ui` Design System MVP before writing real customer/worker/admin pages.
6. Add route/subpath staging rules before relying on `/customer/`, `/worker/`, `/admin/`.

## 19. Deferrable Items

- Dashboard UI until metrics APIs/contracts exist.
- OA UI until workflow/task/approval/notification APIs/contracts exist.
- Full visual polish after Design System MVP and API base/routing are stable.
- Production TLS/domain/monitoring hardening until staging browser UAT passes.
- Provider/payment production integration until owner opens that scope.

## 20. Forbidden Items

- Do not touch production.
- Do not tag production.
- Do not create production env.
- Do not modify refund/reversal/ledger/audit load-bearing chain.
- Do not modify database schema.
- Do not bypass `city_code`.
- Do not bypass `city_scope`.
- Do not bypass RequestContext.
- Do not bypass ScopedExecutor.
- Do not bypass adminQueryGuard.
- Do not use bare `db.query` / `db.execute` in new business paths.
- Do not use fake data as if it were real business data.
- Do not replace Phase 0 Ready with another fake page.
- Do not write pages before architecture/API/UI base rules are frozen.

## 21. Recommended Adaptive Construction Order

This order is conditional and should be re-evaluated at each phase entry.

A. If admin API_BASE dirty work remains uncommitted:

- Open `Phase 14F-hotfix`.
- Fix and test admin API base in isolation.
- Confirm no `/api/api` and no `http://localhost:3000` in browser/network requests.

B. If `packages/ui` remains scaffold:

- Open `Phase 15.1`.
- Build Design System MVP with tokens, primitives, state components, table, and shells.
- Add unit/type tests for UI components.

C. If customer/worker still show Phase 0 Ready:

- Open `Phase 15.2`.
- Build customer/worker route shells with real empty/error/loading states only.
- Then `Phase 15.3` for customer minimum business closure: city config, catalog, pricing, order, payment.
- Then `Phase 15.4` for worker minimum business closure: certification/eligibility, task pool, accept, fulfillment.

D. If admin has real modules but scattered style:

- Open `Phase 15.5`.
- Add `AdminShell`, navigation, consistent data/state components, and governed settlement/gov module wiring.

E. If dashboard/oa have no backend API:

- Open `Phase 15.6` as blueprint/contracts only.
- Do not build fake pages.

F. If dashboard/oa APIs become available:

- Split `Phase 15.6/15.7` into Dashboard MVP and OA MVP.
- Use only real contracts and backend data.

G. Phase 15.8:

- Add five-app staging browser UAT gate.
- Verify `/customer/`, `/worker/`, `/admin/`, `/dashboard/`, `/oa/` only if the latter two are intentionally enabled.
- Verify refresh, network base, no localhost requests, no Phase 0 Ready text, and real empty/error/loading states.

## 22. Production Conclusion

Production is NO-GO.

Reasons:

- customer and worker are not real MVP UI.
- dashboard and OA are placeholders.
- shared UI system is scaffold only.
- admin API base hotfix is dirty and needs isolation/verification.
- no five-app browser UAT gate exists.
- cloud-staging only proves three frontend routes locally/proxy-side, not five-app production readiness.
