# Phase 21 Test Coverage

Date: 2026-07-10
Status: development candidate complete

| Layer | File | Coverage |
| --- | --- | --- |
| Contract | `tests/contract/phase21Operations.contract.test.ts` | 2 tests: valid profile/address contracts and invalid address rejection |
| Integration | `tests/integration/phase21CustomerOperations.test.ts` | 3 tests: persistence/idempotency, customer/city isolation, and historical Phase 4 order-read ownership closure (Customer B 403, Customer A 200, DB owner unchanged) |
| Integration | `tests/integration/phase21AdminOperations.test.ts` | 1 test: city order/SKU/cert lists, canonical SKU mutation, cross-city admin rejection |
| Integration | `tests/integration/phase21CoreJourney.test.ts` | 1 test: order through complaint cross-role journey |
| Security | `tests/security/phase21RoleMatrix.test.ts` | 1 test: five explicit customer/worker/admin cross-role rejections |
| Unit UI | `tests/unit/customerProfileOperationsPage.test.tsx` | 1 test: customer address API binding |
| Unit UI | `tests/unit/platformOperationsPage.test.tsx` | 1 test: admin SKU/certification API binding |
| Unit UI | `tests/unit/workerApp.test.tsx` | 13 focused worker tests; Phase 21 adds wallet and private-location cases |
| Browser | `tests/e2e/phase21-three-app-smoke.spec.ts` | 3 Playwright tests across customer, worker, admin with zero console/page errors |

Focused Vitest gate: 8 files / 23 tests. Phase 21 increment: +7 files / +10 tests, plus +2 tests in the existing worker suite. Full regression: 286 files / 1,145 tests. Playwright is separate: 1 spec / 3 tests.

No old assertion was removed or merged. The single retained todo is `tests/contract/api.contract.test.ts:4` from Phase 1.

## Historical Defect Regression Evidence

`GET /api/orders/:orderId` had been city-scoped but not customer-owned since Phase 4
commit `0b14488`; Phase 14 commit `8f896b7` hardened creation identity without changing
that read behavior. Phase 21 test `prevents one customer from reading another
customer's order` is a database-backed API regression, not a mocked route assertion:

- Customer A creates the order under authenticated context.
- Customer B in the same city receives HTTP 403 for the known order ID.
- Customer A receives HTTP 200 for that same order ID.
- `orders.customer_id` is queried directly and remains Customer A.

The Phase 20 baseline diff proves that this ownership guard was absent; the Phase 21
database-backed regression passes with the guard present.
