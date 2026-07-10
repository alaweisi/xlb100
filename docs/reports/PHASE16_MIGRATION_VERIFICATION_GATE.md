# Phase 16 Migration Verification Gate

Date: 2026-07-10
Result: PASS
Command: `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-phase16-migration-verification.ps1`

## Gate Scope

This gate verifies the Phase 16 schema and data on real local MySQL, including upgrade, cold-start seed ordering, idempotency, city scope, SKU/price coverage, quote APIs, and order quote snapshots.

## Defects Found And Fixed

### Cold-start backfill ordering

Initial clean-database result after migrations followed by seeds:

- enabled SKUs: 1,476
- SKU profiles: 0
- service standards: 0
- enabled price rules: 1,476
- fee items: 0

Cause: migration 033 backfilled before official catalog and pricing seed data existed.

Fix: `seed-local.ps1` and `seed-staging.ps1` now replay the idempotent migration 033 backfill after all seeds. Clean-database result after the fix:

- enabled SKUs: 1,476
- SKU profiles: 1,476
- service standards: 4,428
- enabled price rules: 1,476
- fee items: 8,313
- enabled SKUs missing a profile: 0

### Order snapshot read failure

The first DB-backed order test returned MySQL `ER_NON_UNIQ_ERROR` because the new snapshot join made `order_id` ambiguous.

Fix: `OrderRepository.findById` now scopes the predicate as `orders.order_id` while retaining `orders.city_code` scoping.

## Final Assertions

- migration 033 registration count: 1
- Phase 16 table count: 4
- enabled SKUs missing a profile: 0
- enabled SKUs with fewer than three enabled standards: 0
- enabled price rules missing a base fee: 0
- enabled price rules without fee items: 0
- rows using `city_code='__global__'`: 0
- invalid order quote snapshots: 0
- migration runner second pass applied migrations: 0

## Automated Tests

The gate runs:

- `tests/contract/catalog.contract.test.ts`
- `tests/contract/pricing.contract.test.ts`
- `tests/unit/pricing.test.ts`
- `tests/integration/migrationRunner.test.ts`
- `tests/integration/pricingApi.test.ts`
- `tests/integration/orderCreate.test.ts`

Final result: 6 files passed, 16 tests passed.

## Conclusion

The Phase 16 Migration Verification Gate is satisfied for both an upgraded local database and a clean migration-then-seed database. Phase 16 may close its development stage and Phase 17 may begin.
