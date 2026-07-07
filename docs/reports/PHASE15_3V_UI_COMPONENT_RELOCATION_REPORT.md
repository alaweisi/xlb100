# Phase 15.3V UI Component Relocation Report

## Objective

Converge the repo state into a verifiable five-layer UI structure landing and provide a minimal validation closure.

## Current file distribution

- **Tokens**
  - `packages/ui/src/tokens/index.ts`
  - `packages/ui/src/tokens/ThemeProvider.tsx`
  - `packages/ui/src/tokens/themeRegistry.ts`
  - `packages/ui/src/tokens/tokenTypes.ts`
  - `packages/ui/src/tokens/base/defaultTokens.ts`
  - `packages/ui/src/tokens/themes/default.theme.json`
  - `packages/ui/src/tokens/themes/double11.theme.json`
  - `packages/ui/src/tokens/themes/spring-festival.theme.json`
  - `packages/ui/src/tokens/themes/themeDefinitions.ts`

- **Primitives**
  - `packages/ui/src/components/primitives/index.tsx`
  - `packages/ui/src/components/index.tsx` (currently also hosts many base visual atoms as presentational controls used by the app; extraction is now constrained to manifest/exports only)

- **Patterns**
  - `packages/ui/src/components/patterns/index.tsx`
  - `packages/ui/src/components/index.tsx` (pattern-like widgets are still implemented there and exported through `patterns` contract)

- **Templates**
  - `packages/ui/src/templates/templateContracts.ts`
  - `packages/ui/src/templates/CustomerHomeTemplate.tsx`
  - `packages/ui/src/templates/CustomerServicesTemplate.tsx`
  - `packages/ui/src/templates/CustomerOrderCreateTemplate.tsx`
  - `packages/ui/src/templates/CustomerOrdersTemplate.tsx`
  - `packages/ui/src/templates/CustomerProfileTemplate.tsx`
  - `packages/ui/src/templates/WorkerGrabHallTemplate.tsx`
  - `packages/ui/src/templates/index.ts`

- **App routes**
  - `apps/customer/src/app/App.tsx`
  - `apps/customer/src/pages/CustomerHomePage.tsx`
  - `apps/customer/src/pages/CustomerServicesPage.tsx`
  - `apps/customer/src/pages/CustomerOrderCreatePage.tsx`
  - `apps/customer/src/pages/CustomerOrdersPage.tsx`
  - `apps/customer/src/pages/CustomerProfilePage.tsx`

- **Adapter layer**
  - `apps/customer/src/adapters/campaignAdapter.ts`
  - `apps/customer/src/adapters/catalogAdapters.ts`
  - `apps/customer/src/adapters/orderAdapter.ts`
  - `apps/customer/src/adapters/pricingAdapter.ts`
  - `apps/customer/src/adapters/workflowBindings.ts`
  - `apps/customer/src/adapters/workflowAdapter.ts`
  - `apps/customer/src/pages/customerPageShell.tsx`

## Which files remain in App.tsx

`apps/customer/src/app/App.tsx` still owns route shell orchestration beyond pure composition:

- route detection (`/customer/...` matching)
- shared `cityCode` state and persistence
- catalog loading and error/loading orchestration
- orderId history persistence and order-created navigation
- composition of page props with API-bound callbacks

This is currently in place; no code was changed in this phase, so it remains a follow-up item for stricter route-only assembly in later phase cleanup.

## Primitive import safety

- Searched: `packages/ui/src/components/primitives` and `packages/ui/src/tokens`
- Result: no imports from `@xlb/types` or `@xlb/api-client` in these layer folders.

## Template backend call check

- Searched: `packages/ui/src/templates`
- Result: no `fetch`, `axios`, or `api-client` usage in template files.
- Templates are currently layout+composition only and consume binding/view props.

## Storybook / contract mock status

- `storybook` directory: missing
- `packages/ui/.storybook`: missing
- No Storybook stories exist for primitives/patterns/templates yet.
- Current phase outcome: manifest records expected contract-mock expectation, execution deferred.

## Validation results

- `pnpm --filter @xlb/ui typecheck` — PASS
- `pnpm --filter @xlb/ui build` — PASS
- `pnpm --filter @xlb/customer build` — PASS
- `pnpm --filter @xlb/customer typecheck` — PASS
- Boundary scans:
  - `rg 'from ['"]@xlb/types|from ['"]@xlb/api-client' packages/ui/src/components/primitives packages/ui/src/tokens` — PASS (no matches)
  - `rg 'fetch\(|axios|api-client' packages/ui/src/components packages/ui/src/templates` — PASS (no matches)
  - `rg 'http://localhost:3000|127\.0\.0\.1|/api/api' apps/customer packages/ui packages/api-client` — PASS (no matches)
  - `git diff --check` — PASS
- Root suite:
  - `pnpm test -- --bail=1` — PASS (`255 passed`, 1 todo)

## Follow-up list

- Normalize true layer boundaries so primitives/patterns/template implementations are separated physically instead of sharing a large monolithic `packages/ui/src/components/index.tsx`.
- Reduce business logic in `apps/customer/src/app/App.tsx` to route assembly only; move remaining orchestration into dedicated hooks/pages.
- Add Storybook/contract-mock scaffolding and seed initial stories for templates + key primitives/patterns after this validation pass.
