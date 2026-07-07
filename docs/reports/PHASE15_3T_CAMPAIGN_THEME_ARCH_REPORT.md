# Phase 15.3T Campaign Theme Architecture Report

## Result

Phase 15.3T-ARCH completed the contract and frontend token skeleton for Campaign-driven runtime themes.

This phase intentionally did not add backend Campaign service code, database migrations, Campaign Admin pages, real Campaign APIs, or app route business-flow changes.

## Why Contract/Token Skeleton Only

The immediate risk is frontend theme drift: pages could begin hardcoding festival dates, activity colors, promotion text, or discount logic before the backend Campaign domain exists. This phase locks the boundary first:

- Campaign is the only source of active activity/festival theme decisions.
- `packages/ui` only owns tokens, registry, CSS variable injection, and fallback behavior.
- Business actions remain owned by `WorkflowUiBinding` and backend API facts.

## Backend Campaign Deferred

Backend Campaign requires scheduling, `city_code`, `app_scope`, status transitions, review/revoke behavior, and Admin city-scope governance. Implementing those in this architecture phase would cross into backend business behavior and database design, so it is deferred to Phase 15.3T-IMPL.

## Why `useActiveCampaignTheme` Is Not In `packages/ui`

`packages/ui` must not request backend data, read `city_code`, inspect date/time, or decide an active campaign. A future app-level bridge can call the backend through `@xlb/api-client`, receive `ActiveCampaignResponse`, then pass `themeId` or resolved visual tokens into `ThemeProvider`.

## Relationship To WorkflowUiBinding

Runtime theme tokens are visual-only. They may change surface colors, borders, shadows, and typography variables. They must not change:

- workflow state
- available actions
- disabled reasons
- order/payment/dispatch/settlement/refund behavior
- permissions
- city scope
- audit
- idempotency

The page construction model is now:

`WorkflowUiBinding + Figma Template + Runtime Theme Tokens + packages/ui Components`

## Files Added Or Updated

- `docs/contracts/CONTRACT_CAMPAIGN_THEME.md`
- `docs/design/ui/XLB100_FRONTEND_UI_IMPLEMENTATION_PLAYBOOK.md`
- `docs/frontend/FRONTEND_WORKFLOW_THEME_ROUTE_MATRIX.md`
- `packages/types/src/campaign.ts`
- `packages/validators/src/campaignSchema.ts`
- `packages/ui/src/tokens/base/defaultTokens.ts`
- `packages/ui/src/tokens/themes/default.theme.json`
- `packages/ui/src/tokens/themes/spring-festival.theme.json`
- `packages/ui/src/tokens/themes/double11.theme.json`
- `packages/ui/src/tokens/themes/themeDefinitions.ts`
- `packages/ui/src/tokens/themeRegistry.ts`
- `packages/ui/src/tokens/tokenTypes.ts`
- `packages/ui/src/tokens/ThemeProvider.tsx`

## Phase 15.3T-IMPL Plan

1. Add backend Campaign domain with status transitions and active campaign resolution.
2. Add Campaign database schema and seed only after contract review.
3. Add API-client methods for active campaign lookup.
4. Add app-level theme bridges in Customer/Worker/Admin without placing backend calls in `packages/ui`.
5. Add Admin Campaign management under city-scope governance.
6. Add tests proving theme switching does not affect order, payment, dispatch, settlement, refund, permissions, audit, or idempotency.

## Verification

- `pnpm --filter @xlb/types typecheck`: PASS.
- `pnpm --filter @xlb/validators typecheck`: PASS.
- `pnpm --filter @xlb/ui typecheck`: PASS.
- `pnpm --filter @xlb/ui build`: PASS.
- `pnpm test -- --bail=1`: PASS. 255 test files passed, 1048 tests passed, 1 todo.

## Safety Checks

- `rg "new Date\\(|春节|双11|国庆|中秋|festival|holiday|campaign" apps/customer apps/worker apps/admin packages/ui`: PASS. Matches are limited to required `spring-festival` token id registration in `packages/ui`; no app page date or festival decision logic was found.
- `rg "discount|折扣" apps/customer apps/worker apps/admin packages/ui`: PASS, no matches.
- `rg "http://localhost:3000|127\\.0\\.0\\.1|/api/api" packages/ui packages/types packages/validators`: PASS, no matches.

## Production

- Production: NO-GO.
- Deployment: not performed.
- Tag: not created.
