# Phase 15.0D Page Render Strategy

This document translates the Phase 15 Figma snapshot into page-shell implementation strategy. It does not implement pages.

## Global Strategy

### 390px Mobile Frames

- Treat the 390x844 content canvas as the source for information hierarchy, action order, status placement, and bottom safe area behavior.
- On mobile web, reproduce the frame hierarchy closely: status/header, content stack, primary cards, bottom navigation or bottom action.
- Do not invent new hero sections, marketing banners, fake dashboards, or decorative layouts that do not exist in the Figma snapshot.
- Use real API loading/empty/error/retry states. If an API is unavailable, render an honest unavailable or empty state; do not fake success.

### Web Container Adaptation

- Customer and worker can remain mobile-first web experiences centered in a responsive container for Phase 15.2.
- On desktop, customer/worker should keep the mobile hierarchy with a max-width container until product confirms wider responsive layouts.
- Admin can adapt the mobile Figma hierarchy into a denser desktop `AdminShell`, but must preserve module names, state visibility, action order, and audit/city-scope semantics.
- Dashboard and OA remain blocked from fake MVP because the Figma snapshot has no standalone product frames for them.

## Customer

### 首页

- Figma source: `Customer / Home / Default`.
- Exact reproduction: role tone, location cue, service entry hierarchy, order/service shortcuts, bottom navigation.
- Responsive adaptation: center mobile container on desktop; optional wider spacing only outside the 390px content rhythm.
- Cannot freely modify: service categories, primary action order, bottom nav semantics.
- API state: if service catalog is unavailable, show service area skeleton then real empty/error/retry.

### 服务

- Figma source: `Customer / Services / Default`.
- Exact reproduction: search entry, sort/filter affordance, service/category cards.
- Responsive adaptation: mobile list/grid can become two-column only if labels remain readable and Figma spacing rhythm is preserved.
- Cannot freely modify: service discovery path must not become a static marketing page.
- API state: service catalog must use real API or honest empty/error; no mock SKU or fake price.

### 下单

- Figma source: `Customer / CreateOrder / Default`, `Loading`, `Success`, `Error`.
- Exact reproduction: field order, selected service card, submit/loading/success/error states.
- Responsive adaptation: keep form order and bottom action stable; desktop may use a summary side panel only after API flow is confirmed.
- Cannot freely modify: success state must not be shown unless backend confirms creation.
- API state: loading state during submission, error state with retry, success only from real order response.

### 订单

- Figma source: `Customer / Orders / All`, `Orders / Empty`, `OrderDetail / InProgress`, cancellation states.
- Exact reproduction: order status sequence, order id visibility, cancellation confirmation/success/error.
- Responsive adaptation: desktop may show list/detail split after Phase 15.3, but mobile list/detail route is the baseline.
- Cannot freely modify: order status labels must follow backend state and FlowMap, not frontend invented labels.
- API state: list empty is valid if real API returns none; cancellation success only after backend confirms.

### 我的

- Figma source: `Customer / Mine / Default`, `Settings / Default`.
- Exact reproduction: profile card, address/order/settings entry order.
- Responsive adaptation: keep mobile stack; desktop can remain centered.
- Cannot freely modify: do not imply account/security flows exist if backend/API is not connected.
- API state: profile fields must be authenticated/real or shown as unavailable.

## Worker

### 工作台 / 接单大厅

- Figma source: `Worker / GrabHall / Online`, `Paused`, `Loading`, `Empty`, `Error`, `Radar / States`.
- Exact reproduction: online/paused state, today metrics, nearby work-order card rhythm, radar state language.
- Responsive adaptation: mobile-first center container; desktop can show a wider task pool only after Phase 15.4.
- Cannot freely modify: never fake available orders or online eligibility.
- API state: task availability, city, qualification, and online state must come from real worker APIs.

### 任务

- Figma source: `Worker / Tasks / Accepted`, `TaskDetail / InProgress`, `OrderDetail / BottomSheet`.
- Exact reproduction: task status, order id, action sequence, bottom-sheet detail pattern.
- Responsive adaptation: bottom-sheet on mobile; drawer/detail panel on desktop only when content remains equivalent.
- Cannot freely modify: fulfillment actions must not be client-only fake state changes.
- API state: show loading/error/retry for task detail; actions require real API responses.

### 收入

- Figma source: `Worker / Income / Default`.
- Exact reproduction: weekly/summary metric hierarchy and income list density.
- Responsive adaptation: desktop may use stat card grid while preserving metric labels.
- Cannot freely modify: no fake earnings or payout-ready labels.
- API state: if income API unavailable, show honest unavailable/empty state.

### 我的

- Figma source: `Worker / Mine / Default`.
- Exact reproduction: worker profile, certification/material entries, settings entry.
- Responsive adaptation: keep mobile stack; desktop can center until broader account layout is confirmed.
- Cannot freely modify: certification status must not be fabricated.
- API state: certification and service city must be backend-derived or unavailable.

## Admin

### 首页 / 控制台

- Figma source: `Admin / Dashboard / Default`.
- Exact reproduction: operations center identity, metric cards, bottom navigation labels as mobile reference.
- Responsive adaptation: desktop should use `AdminShell` with SideNav/TopBar and compact stat grid, not a decorative dashboard.
- Cannot freely modify: no fake metrics; no static vanity analytics.
- API state: metric cards should show skeleton/error/unavailable if real API is not present.

### 订单

- Figma source: `Admin / WorkOrderPool / Default`, `Empty`, `Error`, `WorkOrderDetail / Default`, `Dispatch / Default/Loading/Success/Error`.
- Exact reproduction: work-order pool filters, order id visibility, dispatch state sequence.
- Responsive adaptation: desktop may use table-first layout with a detail drawer; cards remain for dense summaries.
- Cannot freely modify: dispatch success/error must come from backend; audit intent must remain visible.
- API state: filters, empty, error, retry, and dispatch loading must be explicit.

### 结算

- Figma source: not detected as standalone settlement frame; existing admin Settlement pages already exist in codebase.
- Exact reproduction: no direct Figma reproduction available.
- Responsive adaptation: Phase 15.5 should harmonize existing Settlement pages with AdminShell/card/table/status rules.
- Cannot freely modify: do not rewrite settlement logic, do not bypass `city_scope`, do not invent settlement outcomes.
- API state: preserve existing API_BASE same-origin behavior and backend-derived status.

### 治理

- Figma source: governance-like admin audit/dispatch/complaint frames plus existing Governance pages in codebase.
- Exact reproduction: use Figma admin state blocks for error/success/loading style; keep existing governance workflows.
- Responsive adaptation: use admin table/detail/audit panel, not mobile-only card pile for all desktop views.
- Cannot freely modify: no bypass of audit trail or readiness review.
- API state: all governance actions must be real API actions or disabled/unavailable.

### 审核 / 配置

- Figma source: `Admin / MasterAudit / Default/Approved/Rejected`, `Complaint / Default`, `AfterSale / Processing/Completed`, `Settings / Default`.
- Exact reproduction: approval/rejection state language, complaint center sections, after-sale status blocks, settings entry order.
- Responsive adaptation: desktop should group audit records, complaint detail, and settings as operational panels.
- Cannot freely modify: no fake master audit approval, no fake after-sale completion.
- API state: approval, rejection, complaint handling, and settings values must be backend-driven or explicit unavailable.

## Loading / Empty / Error / Retry Rules

- Loading: keep shell, nav, and major dimensions stable; show skeletons in content regions.
- Empty: explain why no data exists and offer a real next action or filter reset.
- Error: show error source, retry action, and do not hide persistent failures in transient toast only.
- Retry: retry must call the same real API path; do not mutate local state into success.
- Success: only after a successful backend response or confirmed local-only non-business action.

## Phase Entry Recommendation

Phase 15.2 can begin after human confirmation of responsive strategy. Recommended scope is customer/worker route shells plus required UI gaps (`SearchBar`, `Tabs`, `BottomSheet`, and basic business cards) without fake business data.
