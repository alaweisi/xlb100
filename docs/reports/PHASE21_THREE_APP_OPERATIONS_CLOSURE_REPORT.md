# Phase 21 Three-App Operations Closure Report

Date: 2026-07-10
Status: LOCKED
Branch: `codex/phase21-three-app-operations-closure`
Base: Phase 20 locked main `b9229c253419e4745df395f6cbb8ac2faf14fd39`

## Business Closure

### Customer

- Profile and service-address management now use authenticated backend APIs and MySQL persistence.
- Address create/update/delete is owner- and city-scoped.
- Existing order timeline, reverse request, complaint, evidence view, and customer confirmation pages remain bound to Phase 17/18 APIs.
- Customer order reads now reject access to another customer's order with 403.

### Historical Cross-Customer Order Read Closure

- Source stage: Phase 4 commit `0b14488` introduced `GET /api/orders/:orderId` with
  city isolation but no customer ownership predicate.
- Intermediate history: Phase 14 authentication commit `8f896b7` prevented forged
  `customerId` values during order creation, but retained the Phase 4 city-only read
  path. The defect therefore predates Phase 21 and was not introduced by its UI work.
- Phase 21 correction: `OrderService.getOrder` now checks customer-app reads against
  `order.customerId === context.userId` and raises the existing
  `OrderOwnershipError` (HTTP 403) on mismatch. Admin/worker internal flows retain
  their existing role and route guards.
- Regression evidence: `tests/integration/phase21CustomerOperations.test.ts`, test
  `prevents one customer from reading another customer's order`, creates an order as
  Customer A, proves Customer B receives 403, proves Customer A receives 200, and
  verifies the database row remains owned by Customer A.
- Historical report trace: the Phase 4 Lock report now contains a matching
  traceability note. No locked Phase 4 code, tag, or migration was rewritten.

### Worker

- Wallet now loads the persisted receivable balance, bank accounts, and withdrawal-request records.
- Bank-account and withdrawal-request buttons persist through existing worker finance APIs. A request reserves available receivable balance, and later review / `marked_paid` values are internal bookkeeping states only; they do not assert that a bank, payment channel, or payout provider transferred funds.
- Profile/availability now reads and writes the Phase 20 private worker-location API with radius and sharing controls.
- Existing task accept, fulfillment start/complete, evidence upload, repair cooperation, and certification submit paths remain API-backed.

### Admin

- A unified platform operations page provides the city order pool, SKU availability control, and worker certification review.
- SKU enable/disable updates canonical `service_skus`; certification decisions reuse the existing transition and qualification-refresh services.
- Existing dispatch, aftersale, enterprise, order trace, worker withdrawal review, and settlement surfaces remain API-backed.

## UI False-Completion Audit

Every new action has a concrete contract/API and persisted effect. No success state is produced by local component state alone:

| UI action | API / persisted result |
| --- | --- |
| Customer save profile | `POST /api/customer/profile` -> `customers` |
| Customer add/edit/delete address | customer address APIs -> `customer_addresses` |
| Worker report location | `POST /api/worker/location` -> `worker_locations` and preferences |
| Worker add bank/request withdrawal | worker finance APIs -> canonical finance tables |
| Admin toggle SKU | operations status API -> `service_skus.is_enabled` |
| Admin approve/reject certification | certification review API -> certification state and qualification refresh |

The stale customer profile `not-wired` workflow binding was replaced with wired endpoint metadata.

## Isolation And Permission Matrix

- Customer A reading Customer B's order is explicitly rejected with 403.
- Customer A cannot update Customer B's address; same ID under another city returns 404.
- `__global__` customer-address insertion is rejected by the database.
- Customer, worker, and admin cross-app calls are explicitly rejected.
- An admin scoped only to Hangzhou receives 403 for Shanghai operations and certification queries.
- Migration `040` binds every address to both a real customer and a real city.

## Idempotency And Concurrency

- Migration `041` adds unique `(customer_id, city_code, idempotency_key)` protection.
- Replaying the same address creation returns the same address ID and leaves one row.
- The automated core journey reuses the locked Phase 17-20 idempotent order, offer acceptance, evidence confirmation, and complaint paths.
- Existing Phase 20 concurrent offer accept/timeout tests remain in the full regression suite.

## Automated Journey And Browser Evidence

`tests/integration/phase21CoreJourney.test.ts` runs:

`order -> dispatch/accept -> fulfillment start -> evidence upload -> completion -> customer confirmation -> complaint`

`tests/e2e/phase21-three-app-smoke.spec.ts` starts an isolated backend plus ports 5273/5274/5275 and verifies:

- customer address create/delete through real APIs;
- worker private location reporting through the Phase 20 API;
- admin order/SKU/certification operations data;
- zero browser console errors and zero page errors across all three apps.

## Migration Verification

- Migrations `040` and `041` are append-only.
- Replay output reports both versions as `SKIP`.
- Each schema marker count equals exactly `1`.
- `customer_addresses` table count = 1; global rows = 0; orphan customer references = 0.
- Real external geo provider execution count remains 0.

Formal gate: `scripts/check-phase21-migration-verification.ps1`.

## Verification Results

- Phase 21 focused Vitest gate: PASS, 8 files / 23 tests.
- Phase 21 Playwright: PASS, 1 spec / 3 tests.
- Full regression: PASS, 286 files / 1,145 tests; 1 existing Phase 1 todo.
- Typecheck: PASS, 17/17 tasks.
- Build: PASS, 11/11 tasks.
- Architecture preflight: PASS, including the Phase 21 boundary gate.

## Boundaries

- No real payment/refund/payout/settlement execution.
- No provider-driven withdrawal execution. Request, review, balance reservation, and
  operator `marked_paid` are auditable internal records only; `marked_paid` is not
  provider settlement evidence and does not call a bank, payment channel, or payout
  API.
- No real Amap, map tiles, or external geo provider call.
- No real OSS/S3/COS call.
- Phase 22 observability, performance, security expansion, and formal full-stack E2E are not entered.

## Todo And Test Accounting

The retained todo is `tests/contract/api.contract.test.ts:4` (`Phase 1: customer API contract`). It predates Phase 21.

Compared with Phase 20 locked baseline (279 files / 1,133 tests), Phase 21 adds seven Vitest files and ten tests, plus two tests in the existing worker app suite. No prior test was removed, merged, skipped, or converted to todo. Playwright is reported separately.

## Incidental Historical-Gate Cleanup

The Phase 9A-9E exact allowlists were extended only for the approved Phase 21 migration, operations page, worker page, and reports. Matching rules were not weakened. This is out-of-scope historical gate compatibility cleanup, not a Phase 21 business deliverable.

## User Asset Protection

The five user-owned audit artifacts in the `G:\xlb100` main worktree remain untracked,
untouched, and excluded from this branch and all Phase 21 staging. Verification used
`git -C G:\xlb100 status --short` (all five remain `??`) and `git -C G:\xlb100
ls-files -- <five paths>` (no tracked result):

- `docs/architecture-reaudit-2026-07-09.md`
- `docs/reports/ARCH_BENCHMARK_WSF_LUBAN_ZMN_2026-07-09.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.md`
- `docs/reports/FRESH_BENCHMARK_XLB_2026-07-10.pdf`
- `docs/reports/FULL_BENCHMARK_XLB_VS_COMPETITORS_2026-07-10.md`

## Lock Conclusion

- Merged to `main`: yes, with `--no-ff` merge commit
  `7b7caeef453b9a039433c40bd6d1371494554c45`.
- Tag: `xlb-phase21-three-app-operations-closure`, targeting the merge commit.
- Feature evidence: `fbd7faf`; audit trace evidence: `98137f1`.
- Post-merge typecheck: PASS, 17/17 tasks.
- Post-merge build: PASS, 11/11 tasks.
- Post-merge full regression: PASS, 286 files / 1,145 tests plus the documented
  existing Phase 1 todo. Historical Phase 9 React `act(...)` warnings remain
  non-blocking and introduced no failed assertion.
- Post-merge architecture preflight: PASS.
- Post-merge Phase 21 formal gate: PASS, migrations `040/041` replayed as `SKIP`,
  schema markers each equal 1, real geo provider executions equal 0, focused Vitest
  8 files / 23 tests, and Playwright 1 spec / 3 tests.
- User-owned audit assets remained untracked and were not staged or committed.

Phase 21 is LOCKED. Phase 22 was not entered during this Lock ceremony.
