# Phase 15.3V Customer Unified Location Search Bar Report

## Scope

- 仅允许改动：`packages/ui/**`、`apps/customer/**`、`docs/reports/PHASE15_3V_CUSTOMER_SERVICE_DISCOVERY_UI_SLICE_REPORT.md`、`docs/execution/PHASE15_PROGRESS.md`
- 禁止改动：`apps/worker/**`、`apps/admin/**`、`backend/**`、`db/**`、`deploy/**`、`infra/**`
- 目标：修复 C 端首页顶部的服务发现入口结构，将“服务城市卡片 + 搜索卡片”改为一体化搜索条。

## What Changed

### 1) `packages/ui` one-pill location search

- Reworked `LocationSearchBar` in `packages/ui/src/components/index.tsx` to be a single pill container.
- New structure:
  - Left city slot: `📍 {cityLabel}` + down-arrow
  - Divider line between city slot and search area
  - Right search area: input + rightmost search icon
- Satisfies mobile constraints:
  - Rounded container (`borderRadius: 999`)
  - `minHeight: 52`
  - left area max width limited to `35%` and fills residual space to search area

### 2) `/customer/` homepage integration

- In `HomePage`, `LocationSearchBar` now receives:
  - `cityLabel={cityCode}` (selected city code)
  - `areaLabel={cityAreaByCode[cityCode] ?? "静安区"}`
  - `placeholder="搜保洁、维修、搬家、月嫂"`
- Removed the previous standalone “服务城市” card from the main flow.
- City switching remains using existing `selectedCityCode` state path:
  - expanding selector still rendered directly under the search bar when city entry is clicked
  - preserves existing local persistence and behavior in `readCity` / `updateCity`
- Real catalog filter behavior unchanged: homepage search still filters by catalog text and fallback cards are still tied to catalog response.

## What Was Not Changed

- No Worker/Admin/pages outside customer changed
- No backend/business workflow/API implementation changes
- No fake orders / fake users / fake payment success / fake dispatch introduced
- No campaign/theme backend logic changes

## UI-facing Compliance

- Main user interface remains business-readable text.
- Debug/UAT technical facts are still under collapsible panels, not user-facing top-level copy.

## Verification

- `pnpm --filter @xlb/ui typecheck` — PASS
- `pnpm --filter @xlb/ui build` — PASS
- `pnpm --filter @xlb/customer typecheck` — PASS
- `pnpm --filter @xlb/customer build` — PASS
- `pnpm test -- --bail=1` — PASS (`255` test files, `1048` tests passed, `1` todo)
- `git diff --check` — PASS
- `git status --short` reviewed and only expected scope files modified
