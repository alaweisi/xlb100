# Phase 15.3F-3 Customer Header Search and Quantity UX Fix Report

## Scope

This phase targets only C 端 UI information structure (no backend/workflow changes, no Worker/Admin changes).

Allowed scope:
- `packages/ui/**`
- `apps/customer/**`
- `docs/reports/PHASE15_3F3_CUSTOMER_HEADER_QUANTITY_UX_REPORT.md`
- `docs/execution/PHASE15_PROGRESS.md`

## Route Focus

- `/customer/`
- `/customer/services`
- `/customer/order/create`

## What was changed

### `packages/ui` components

1. Added `LocationSearchBar`
   - Props:
     - `cityLabel`
     - `areaLabel?`
     - `placeholder?`
     - `value`
     - `onSearchChange`
     - `onCityClick?`
     - plus style passthrough via `HTMLAttributes<HTMLDivElement>`
   - Behavior:
     - Composes city chip + input using existing runtime tokens/colors.
     - No backend calls.
     - No location detection.
     - No import of business model types.

2. Added `QuantityStepper`
   - Props:
     - `value`
     - `min?` (default `1`)
     - `max?`
     - `onChange`
     - `disabled?`
   - Behavior:
     - `value=1` cannot decrement below `min`.
     - never emits values below `min`.
     - no order/pricing domain logic embedded.

### `apps/customer` pages

1. `/customer/` homepage
   - Replaced separate bottom “服务城市” card with integrated location-search entry in header area.
   - Header now shows:
     - city chip: `hangzhou · 静安区` (and similar format by city code)
     - search placeholder: `搜保洁、维修、搬家、月嫂`
   - “城市切换” uses existing city selector flow (`selectedCityCode` state) and is shown as an expandable picker under the header chip.
   - Removed duplicate city card from the main flow.
   - Added service-path de-duplication for service subtitles and selection lists.
   - Kept existing TrustPill and UAT fold panel behavior.

2. `/customer/order/create`
   - Replaced numeric `<Input>` quantity field with `QuantityStepper`.
   - Default remains `1`.
   - Quantity can no longer delete to empty / zero.
   - Added explicit fallback action “更换服务” when a service is selected (returns to services).
   - Service option labels and selected service card subtitle are de-duplicated to avoid repeated三级路径 content.
   - Kept catalog → quote → order → payment order → order detail real-chain behavior.

## What was not changed

- Worker pages and Admin pages: **unchanged**
- Backend/db/deploy/infra: **unchanged**
- No fake orders, fake users, fake payment success, fake dispatch.

## Verification

- `pnpm --filter @xlb/ui typecheck` — PASS
- `pnpm --filter @xlb/ui build` — PASS
- `pnpm --filter @xlb/customer typecheck` — PASS
- `pnpm --filter @xlb/customer build` — PASS
- `pnpm test -- --bail=1` — PASS (`255` test files, `1048` tests passed, `1` todo)
- `rg "http://localhost:3000|127\.0\.0\.1|/api/api" apps/customer packages/ui packages/api-client` — PASS (no matches)
- `git diff --check` — PASS

## Status

- Scope and verification are PASS for this phase.
- Next phase: proceed to `Phase 15.3F-4` / further Customer front-line UX polish if required.
