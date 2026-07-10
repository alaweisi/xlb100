# Phase 16 SKU / Pricing / Fee Items / Installation Standards Foundation Report

Date: 2026-07-10
Status: COMPLETE; migration verification gate passed
Scope: SKU productization, transparent quote breakdown, service standards, and immutable order quote snapshot

## 1. Objective

Phase 16 starts the competitive gap closure work after the existing Phase 15 UI/productization phase.

This phase targets the SKU and pricing shortboard identified in the benchmark against Wanshifu, Luban Daojia, and Zhuomuniao:

- Wanshifu-style transparent fee structure and later fee-addition readiness.
- Luban-style model/brand-aware SKU service productization and installation standards.
- Zhuomuniao-style standard quotation, service guarantees, and visible service rules.

This phase does not integrate real payment providers, real map APIs, dispatch assignment, ledger mutation, or refund execution.

## 2. Implemented Capabilities

### 2.1 SKU Service Profiles

Added `service_sku_profiles`:

- `service_mode`: installation / repair / cleaning / delivery / measurement / dismantle / maintenance / inspection
- `brand_scope`
- `model_scope`
- `skill_level`: basic / advanced / specialist
- `warranty_days`
- `requires_model`
- `requires_measurement`
- `supports_enterprise`
- `service_guarantee_text`

The migration auto-populates every enabled existing SKU by inferring mode and requirements from category/item/SKU names and item paths.

### 2.2 Service Standards

Added `service_standards`:

- service pre-check standard
- operation standard
- warranty/aftersale standard

The migration writes at least three baseline standards for each enabled SKU.

### 2.3 Transparent Fee Items

Added `price_fee_items`:

- base service fee
- material fee placeholder
- floor/carry fee placeholder
- remote distance fee placeholder
- urgent service fee placeholder
- diagnosis fee for repair/maintenance/inspection-like SKUs

These are city-scoped and tied to existing `price_rules`.

### 2.4 Quote Breakdown API

`GET /api/pricing/quote?skuId=...` still returns old compatible fields:

- `basePrice`
- `priceText`
- `priceType`
- `priceRuleId`
- `version`

It now also returns:

- `skuProfile`
- `standards`
- `breakdown.baseAmount`
- `breakdown.requiredFeeAmount`
- `breakdown.optionalFeeAmount`
- `breakdown.totalAmount`
- `breakdown.feeItems`

### 2.5 Order Quote Snapshot

Added `order_price_snapshots`:

- stores immutable JSON quote snapshot per order
- includes price rule, quantity, total, breakdown, SKU profile, and standards

Order creation now computes total from `breakdown.totalAmount * quantity`, while preserving the old order columns.

## 3. Files Changed

Contracts and docs:

- `docs/contracts/CONTRACT_CATALOG.md`
- `docs/contracts/CONTRACT_PRICING.md`
- `docs/contracts/CONTRACT_ORDER.md`
- `db/dictionary/TABLES.md`
- `db/dictionary/CITY_CODE_COLUMNS.md`
- `docs/execution/PHASE16_TO_22_COMPETITIVE_GAP_CLOSURE_PLAN.md`

Types and validators:

- `packages/types/src/catalog.ts`
- `packages/types/src/pricing.ts`
- `packages/types/src/order.ts`
- `packages/types/src/index.ts`
- `packages/validators/src/catalogSchema.ts`
- `packages/validators/src/pricingSchema.ts`
- `packages/validators/src/orderSchema.ts`
- `packages/validators/src/index.ts`

Backend:

- `backend/src/catalog/catalogRepository.ts`
- `backend/src/pricing/pricingRepository.ts`
- `backend/src/pricing/pricingService.ts`
- `backend/src/order/orderRepository.ts`
- `backend/src/order/orderService.ts`

API client:

- `packages/api-client/src/customer.ts`

Database:

- `db/migrations/033_phase16_sku_pricing_standards.sql`
- `scripts/seed-local.ps1`
- `scripts/seed-staging.ps1`
- `scripts/check-phase16-migration-verification.ps1`

Tests:

- `tests/contract/catalog.contract.test.ts`
- `tests/contract/pricing.contract.test.ts`
- `tests/unit/pricing.test.ts`
- `tests/integration/pricingApi.test.ts`
- `tests/integration/orderCreate.test.ts`

## 4. Boundary Kept

- No real WeChat Pay / Alipay / bank / payout / provider refund integration.
- No real Amap or paid geo API integration.
- No dispatch worker assignment changes.
- No ledger or settlement mutation changes.
- No global SKU, global pricing, or national fallback.
- No old migration edits.

## 5. Migration Verification Gate

The formal gate is:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase16-migration-verification.ps1
```

Result on 2026-07-10: PASS.

Verified:

- Docker MySQL was healthy and migration `033_phase16_sku_pricing_standards` was applied exactly once.
- All four Phase 16 tables exist.
- 1,476 enabled SKUs have 1,476 profiles and at least three standards each.
- 1,476 enabled price rules all have fee items and a required base fee.
- No Phase 16 table contains `city_code='__global__'`.
- Order creation persists a valid quote snapshot with fee items and standards.
- Re-running migration and seed is idempotent.
- Six Phase 16 contract/unit/integration files passed with 16 tests.
- `npx pnpm typecheck` passed all 17 tasks and `git diff --check` passed.

The gate also tested a clean temporary database. It exposed that migration 033 originally ran before catalog/pricing seeds and therefore produced zero derived rows on a cold start. Local and staging seed scripts now replay the idempotent Phase 16 backfill after seeds. The clean database then produced:

- 1,476 SKU profiles
- 4,428 service standards
- 8,313 price fee items
- zero enabled SKUs missing a profile

The DB-backed order test also exposed an ambiguous `order_id` condition after joining `order_price_snapshots`; the query now uses `orders.order_id`.

Detailed evidence: `docs/reports/PHASE16_MIGRATION_VERIFICATION_GATE.md`.

## 6. Residual Repository Gates

- The Phase 16 migration gate is green.
- The repository-wide `npx pnpm test -- --bail=1` run passed all 107 unit/contract files and 632 tests, then an unrelated Phase 9 worker-statement review-summary test timed out after historical test data growth; 145 later DB files were skipped by `--bail`.
- The historical Phase 9B preflight runtime/auth script failures were resolved during the Phase 17 Lock preparation by migrating the runtime gates to Bearer tokens and the repository-local backend `tsx` command.
- Admin SKU/pricing write pages remain scheduled for Phase 21 operations UI closure, consistent with the cross-phase plan.

## 7. Closure

Phase 16 development is complete. Phase 17 order reverse flow and aftersale complaints is now the active development phase. No merge, tag, or formal Phase Lock was performed in this closure task.
