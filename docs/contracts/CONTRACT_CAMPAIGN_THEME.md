# CONTRACT_CAMPAIGN_THEME

## Purpose

Campaign is the only data source for activity and festival theme activation in XLB100.
Frontend code must not infer Spring Festival, Double 11, National Day, Mid-Autumn Festival, or any activity window by local date, route, city, or user behavior.

This contract defines the boundary between backend Campaign decisions and frontend runtime theme rendering.

## Campaign Record

Required fields:

| field | type | rule |
| --- | --- | --- |
| `id` | string | Backend-owned campaign id. |
| `name` | string | Operational name. Not a frontend business rule. |
| `themeId` | string | Token package id consumed by the frontend theme bridge. |
| `cityScope` | `all` or city list | Reuses the XLB `city_code` scope model. |
| `appScope` | app list | `customer`, `worker`, `admin`, or `all`. |
| `startAt` | ISO datetime | Backend scheduling input only. |
| `endAt` | ISO datetime | Backend scheduling input only. |
| `discountRuleId` | string or null | Reference to backend pricing/payment rules only. |
| `bannerContent` | object or null | Backend-provided banner content. |
| `status` | enum | `draft`, `scheduled`, `active`, `ended`, `revoked`. |

`status` values:

- `draft`: editable operational record, not active.
- `scheduled`: approved for a future backend window.
- `active`: backend-selected active campaign result.
- `ended`: finished and no longer active.
- `revoked`: manually withdrawn and no longer active.

## Hard Boundaries

- Campaign may decide `themeId`, `bannerContent`, and activity visual presence.
- Campaign must not decide order creation rules, payment state, dispatch eligibility, settlement, refund, permissions, audit, or idempotency.
- `discountRuleId` may only reference backend pricing/payment rules. Frontend code must not calculate campaign discounts, parse discount numbers, or compare activity windows.
- Frontend pages may only consume an active campaign result returned by backend or an injected app-level bridge.
- `packages/ui` may only render tokens and CSS variables. It must not request Campaign data, read `city_code`, inspect date/time, or choose an active campaign.

## Runtime Consumption

The allowed frontend flow is:

1. Backend Campaign service resolves active campaign from status, time window, `city_code`, and `app_scope`.
2. App-level theme bridge receives `ActiveCampaignResponse`.
3. The bridge passes `themeId` or resolved visual tokens into `ThemeProvider`.
4. `ThemeProvider` applies CSS variables.
5. Workflow and business actions remain controlled by `WorkflowUiBinding` and backend API facts.

Default theme is the mandatory safe fallback when no active campaign exists or an unknown `themeId` is returned.

## Forbidden Frontend Behavior

- No `new Date()` campaign activation checks in frontend pages.
- No hardcoded festival/activity colors in pages.
- No hardcoded promotion copy, discount numbers, or activity time windows in pages.
- No theme-driven order, payment, dispatch, settlement, refund, permission, audit, or idempotency branch.
- No Campaign API calls from `packages/ui`.

## Admin Scope

Future Admin Campaign management must be governed by the existing `city_scope` model. Admin users may only create, review, activate, revoke, or inspect Campaign records within their authorized city scope.
