# XLB100 Phase 15 UI Visual Refinement Skill

> Purpose: 固化 Phase 15 三端 UI 视觉精修施工规则。此 skill 只定义施工方法，不授权直接修改业务逻辑、后端、数据库、部署或生产配置。

## 0. Activation

Use this skill when the task mentions any of:

- Phase 15 UI / visual refinement / productization / Figma visual system.
- Customer / Worker / Admin route shell visual polishing.
- `packages/ui` component variants for Phase 15.
- zh-CN copy pass, loading/empty/error/retry polish, or not-wired presentation.

Do not use this skill for backend, database, deployment, production release, settlement execution, payment execution, worker dispatch execution, or tag creation.

## 1. Required Sources

Read these before editing UI:

- `docs/design/figma/manifest.json`
- `docs/design/figma/pages.json`
- `docs/design/figma/components.json`
- `docs/design/figma/tokens.json`
- `docs/design/figma/optimized/tokens.optimized.json`
- `docs/design/figma/optimized/component-render-rules.md`
- `docs/design/figma/optimized/page-render-strategy.md`
- `docs/design/figma/optimized/render-performance-guidelines.md`
- `packages/ui/README.md`
- `packages/ui/src/index.ts`
- `packages/ui/src/components/index.tsx`
- `packages/ui/src/layouts/index.tsx`
- Current app page files in the requested app scope only.

When Figma and code disagree, do not freely redesign. Record the mismatch and choose the smallest implementation that preserves real business state and the Figma information hierarchy.

## 2. Hard Boundaries

Always forbidden unless a newer human instruction explicitly changes scope:

- Do not modify `backend/**`, `db/**`, `deploy/**`, `infra/**`, production env, or tags.
- Do not modify `apps/dashboard/**` or `apps/oa/**` for Phase 15 UI unless standalone Figma frames exist.
- Do not invent fake customer orders, fake users, fake addresses, fake payments, fake worker tasks, fake income, fake qualifications, fake admin metrics, or fake settlement outcomes.
- Do not use Figma PNG exports as page backgrounds.
- Do not replace a real API page with a static demo page.
- Do not change same-origin API behavior; no `http://localhost:3000`, no `127.0.0.1`, no `/api/api`.
- Do not swallow 400/403/409/500 errors. Render persistent error states with retry where retry is meaningful.
- Do not rewrite existing Admin Settlement/Governance business logic during visual-only passes.

## 3. Frame Mapping Contract

Every UI pass must start by documenting:

| App | Route | Figma frame(s) | Component mapping | API state |
| --- | --- | --- | --- | --- |

Minimum expected mappings:

- Customer:
  - `/customer/` -> `Customer / Home / Default`
  - `/customer/services` -> `Customer / Services / Default`
  - `/customer/order/create` -> `Customer / CreateOrder / Default`, `Loading`, `Success`, `Error`
  - `/customer/orders` -> `Customer / Orders / All`, `Orders / Empty`, `OrderDetail / InProgress`
  - `/customer/profile` -> `Customer / Mine / Default`, `Settings / Default`
- Worker:
  - `/worker/` -> `Worker / GrabHall / Online`, `Paused`, `Loading`, `Empty`, `Error`
  - `/worker/tasks` -> `Worker / Tasks / Accepted`, `TaskDetail / InProgress`
  - `/worker/wallet` -> `Worker / Income / Default`
  - `/worker/profile` and `/worker/certification` -> `Worker / Mine / Default`
- Admin:
  - Existing Settlement/Governance pages -> admin dashboard/state/table rules plus existing settlement constraints.
  - Do not invent missing Settlement Figma frames; harmonize existing pages using admin card/table/status rules.

## 4. Visual System Rules

Use Figma/Codex optimized tokens:

- Customer accent: `#B85F2A`
- Worker accent: `#08172B`
- Admin accent: `#191225`
- Shared ink: `#173F35`
- Coffee text: `#2B2118`
- Cream surface: `#FFFAF0`
- Radius: 16 / 24 / 28 where Figma requires; 8 only for compact admin controls.
- Spacing: 8pt rhythm.
- Typography: prefer stable, readable zh-CN hierarchy; do not scale font size with viewport width.

Mobile customer/worker:

- Use the 390px Figma mobile hierarchy as the primary source.
- Center in a max-width mobile container on desktop unless a broader responsive layout is explicitly approved.
- Keep bottom navigation stable with safe-area padding.

Admin:

- Use `AdminShell`, `SideNav`, `TopBar`, compact metric/card/table layout.
- Preserve `city_scope` visibility and audit boundaries.
- Prefer dense operational layouts over marketing-style hero sections.

## 5. Component Rules

Prefer `@xlb/ui` components and extend them when a repeated UI pattern appears.

Expected Phase 15 visual primitives:

- `Button`
- `Card`
- `HeroCard`
- `MetricCard` / `StatCard`
- `GuardrailCard`
- `SearchBar`
- `Tabs` / `SegmentedControl`
- `BottomNav`
- `TopBar`
- `SideNav`
- `StatusTag` / `StateBadge` / `ScopeBadge`
- `EmptyState`
- `LoadingState`
- `ApiErrorPanel` / `ErrorState`
- `NotWiredState`
- `ServiceCard`
- `OrderCard`
- `CustomerQuoteCard`
- `WorkOrderCard` / `WorkerTaskCard` / `WorkerStatusCard`
- `Table`
- `Timeline`
- `BottomSheet`

Component implementation constraints:

- Components must remain business-neutral.
- Components must not call APIs.
- Components must not contain fake business data.
- Components should accept `className`/`style` or local extension points where the existing package pattern supports it.
- State labels must be supplied by app code from real API state or honest not-wired state.

## 6. Copy Rules

User-visible copy should be zh-CN first.

Allowed English only when:

- It is an API path, type name, package name, code symbol, or backend enum returned by a real API.
- It appears inside technical error detail, debug details, or compatibility text required by existing tests.

Not-wired copy must be honest:

- Use "未接线", "暂未接入", "等待真实 API", or "暂无真实数据".
- Never imply a capability is complete when the API is missing.
- Never replace missing API with local demo data.

## 7. App-Specific Rules

Customer:

- Preserve real `catalog`, `pricing quote`, `order create`, `order detail`, and `payment order` wiring.
- Do not trigger fake payment success from the UI.
- If order list/profile/address API is missing, render explicit not-wired or unavailable state.

Worker:

- Until real W APIs are wired, render not-wired/empty states for task pool, qualification, wallet/income, fulfillment, and profile.
- Do not fabricate tasks, income, online eligibility, certifications, service city, or task status.

Admin:

- Preserve existing Settlement/Governance API calls and same-origin `API_BASE`.
- Do not rewrite settlement calculations, governance actions, dry-run planner semantics, or city-scope behavior.
- Error states must show backend failures instead of hiding them.

## 8. Required Verification

For UI code changes, run all available commands in scope:

```powershell
pnpm --filter @xlb/ui typecheck
pnpm --filter @xlb/ui build
pnpm --filter @xlb/customer typecheck
pnpm --filter @xlb/customer build
pnpm --filter @xlb/worker typecheck
pnpm --filter @xlb/worker build
pnpm --filter @xlb/admin typecheck
pnpm --filter @xlb/admin build
pnpm test -- --bail=1
rg "Phase 0 Ready" apps/customer apps/worker apps/admin
rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" apps/customer apps/worker apps/admin packages/api-client
rg "mock|fake|dummy" apps/customer apps/worker apps/admin packages/api-client
```

If the task is docs-only, do not run app builds unless requested. At minimum run:

```powershell
git diff --check
git status --short
```

## 9. Reporting Template

Every Phase 15 visual pass report should include:

- Figma frame -> route -> component mapping.
- Files changed.
- `@xlb/ui` component additions or variants.
- API wiring preserved.
- Not-wired list.
- Fake-data check result.
- Same-origin check result.
- Build/typecheck/test result.
- Production conclusion: `NO-GO`.
- Whether cloud-staging upload was performed. If not explicitly requested, do not deploy.

