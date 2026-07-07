# Phase 15.3C Figma Visual Refinement & zh-CN Copy Report

## Scope

- Phase: 15.3C.
- Goal: refine customer, worker, and admin visual rendering with zh-CN user-facing copy.
- Source: `docs/design/figma/**`, `docs/design/figma/optimized/**`, and `docs/prompts/CODEX_PHASE15_UI_VISUAL_REFINEMENT_SKILL.md`.
- Backend/db/deploy/infra changes: none.
- Production: NO-GO.
- Tags: not created.

## Figma Frame -> Route -> Component Mapping

| Figma area | App route | Primary `@xlb/ui` components | Phase 15.3C treatment |
| --- | --- | --- | --- |
| customer home mobile frame | `/customer/` | `MobileShell`, `TopBar`, `BottomNav`, `HeroCard`, `SearchBar`, `ServiceCard`, `StatusTag` | Preserved real catalog API state and replaced English wiring labels with zh-CN product copy. |
| customer services frame | `/customer/services` | `MobileShell`, `Tabs`, `SearchBar`, `ServiceCard`, `EmptyState` | Kept real catalog filtering; no fake service SKU was added. |
| customer order/create frame | `/customer/order/create` | `Card`, `FormField`, `Select`, `CustomerQuoteCard`, `Timeline`, `OrderCard`, `PriceText` | Preserved pricing quote, order create, order detail, and payment order wiring. |
| customer orders frame | `/customer/orders` | `OrderCard`, `Timeline`, `NotWiredState`, `EmptyState`, `ErrorState` | Kept explicit order-list API not-wired state and local detail re-read behavior only for real created order IDs. |
| customer profile frame | `/customer/profile` | `Card`, `Timeline`, `NotWiredState`, `StatusTag` | Kept profile/address/account APIs as not-wired; no fake user profile. |
| worker grab hall frame | `/worker/` | `MobileShell`, `HeroCard`, `SearchBar`, `Tabs`, `MetricCard`, `WorkerStatusCard`, `NotWiredState` | Productized empty/not-wired task pool without fake tasks or online qualification. |
| worker tasks frame | `/worker/tasks` | `Card`, `WorkerStatusCard`, `NotWiredState` | Kept task detail and fulfillment APIs not-wired. |
| worker income frame | `/worker/wallet` | `MetricCard`, `Card`, `Timeline`, `NotWiredState` | Kept income/wallet APIs not-wired; no fake earnings or withdrawal state. |
| worker mine frame | `/worker/profile` | `Card`, `Timeline`, `NotWiredState` | Kept certification/profile APIs not-wired; no fake credential state. |
| admin settlement console frame | admin settlement hash route | `AdminShell`, `GuardrailCard`, `MetricCard`, `Table`, `ScopeBadge`, `ApiErrorPanel` | Preserved Settlement API calls and city scope; zh-CN visible copy with hidden legacy test anchors. |
| admin export review frame | admin export hash route | `Card`, `Table`, `ScopeBadge`, `LoadingState`, `ApiErrorPanel`, `EmptyState` | Preserved export audit flow and detail navigation; no settlement logic rewrite. |
| admin statement detail frame | admin detail hash route | `Card`, `Table`, `Timeline`, `PriceText`, `ScopeBadge`, `ApiErrorPanel` | Preserved detail API flow and backend enum/status values. |
| admin governance frame | admin governance hash route | `Button`, `StatusTag`, guarded panels | Preserved governance planner/read-only boundaries; zh-CN copy without enabling execution. |

## UI Components Added

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

## Customer Result

- Real APIs remain wired: catalog, pricing quote, order create, order detail, payment order.
- Payment success is not fabricated.
- Customer profile, address book, and order list remain explicit not-wired states.
- User-visible English wiring badges were replaced with zh-CN status copy.

## Worker Result

- Task pool, task detail, eligibility, wallet/income, and certification remain not-wired.
- Empty states are productized but do not include fake tasks, fake earnings, fake credentials, or fake online state.

## Admin Result

- Existing Settlement/Governance logic is preserved.
- AdminShell, city-scope badges, metric cards, tables, empty states, loading states, and error panels are visually refined.
- Backend error detail remains visible; 400-class responses are not swallowed.
- Governance execution boundary remains disabled.

## Validation Plan

Required before commit:

- `pnpm --filter @xlb/ui typecheck`
- `pnpm --filter @xlb/ui build`
- `pnpm --filter @xlb/customer typecheck`
- `pnpm --filter @xlb/customer build`
- `pnpm --filter @xlb/worker typecheck`
- `pnpm --filter @xlb/worker build`
- `pnpm --filter @xlb/admin typecheck`
- `pnpm --filter @xlb/admin build`
- `pnpm test -- --bail=1`

## Recommendation

After this commit passes verification and cloud-staging UAT upload, Phase 15.4 may start only as a worker real API wiring phase. It must not fabricate task, wallet, certification, or qualification data.
