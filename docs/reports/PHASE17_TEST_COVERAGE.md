# Phase 17 Test Coverage

Date: 2026-07-10
Status: Lock candidate coverage statement
Gate: `scripts/check-phase17-migration-verification.ps1`

## 1. Automated Coverage Inventory

| Layer | File | Coverage |
| --- | --- | --- |
| Unit | `tests/unit/orderReverseStateMachine.test.ts` | Review, apply, rejected terminal state, applied terminal state, invalid transitions |
| Unit | `tests/unit/aftersaleStateMachines.test.ts` | Complaint triage/resolution/close, assigned repair lifecycle, non-executing compensation terminal state |
| Contract | `tests/contract/aftersale.contract.test.ts` | Reschedule fields, complaint/liability validation, compensation approval shape, Phase 17 outbox event names |
| DB integration | `tests/integration/phase17OrderReverseAftersale.test.ts` | Order creation, reschedule idempotency/review/apply, cancellation, complaint lifecycle, repair, liability, compensation intent, timeline, refund/ledger non-mutation |
| Security boundary | `tests/security/phase17Boundaries.test.ts` | Static boundary gate for payment, provider refund, ledger, and dispatch-assignment mutation |

The formal Phase 17 gate runs five test files with 11 tests. The DB integration chain also verifies multiple assertions inside its end-to-end business-flow test.

## 2. Requirement Coverage Matrix

| Requirement | Automated evidence | Browser evidence | Result |
| --- | --- | --- | --- |
| Customer cancel request and approved apply | DB integration | Customer aftersale page | Covered |
| Customer reschedule and quote-independent schedule update | Contract + DB integration | Customer aftersale page | Covered |
| Reverse-request idempotency | DB integration | Not required | Covered |
| Reassignment does not mutate dispatch | Security boundary gate | Admin guardrail copy | Covered as Phase 17 boundary |
| Customer complaint ownership | DB integration wrong-customer denial | Customer complaint view | Covered |
| `admin` and `operator` role compatibility | DB integration for both roles | `admin-hangzhou` queue load | Covered |
| Complaint triage, resolve, close, and timeline | Unit + DB integration | Admin case console | Covered |
| Assigned-worker-only repair mutation | DB integration wrong-worker denial | Worker assigned-repair list | Covered |
| Liability percentages and immutability | Contract + DB integration replay/conflict | Admin liability controls | Covered |
| Compensation amount ceiling | Contract + DB integration over-limit denial | Admin compensation controls | Covered |
| Compensation never executes a provider refund | Contract + security + DB queries | Admin `not_executed` state | Covered |
| No ledger accrual from complaint compensation | Security + DB query | Not required | Covered |
| City scoping and no `__global__` rows | Migration gate + DB assertions | City badges on A/W/C | Covered |
| Migration idempotency | Migration gate verifies migration 034 exactly once | Not required | Covered |

## 3. Manual Browser Smoke

The Lock candidate was exercised against the current-workspace backend on port 3017:

- Customer: `/customer/aftersale` rendered reverse and complaint controls.
- Admin: `#/aftersale?cityCode=hangzhou` authenticated as `admin-hangzhou` and loaded city-scoped reverse/complaint queues.
- Worker: `/worker/repairs` authenticated as `worker-demo-hangzhou` and loaded only assigned repair visits.

This is browser smoke evidence, not a committed Playwright suite.

## 4. Explicitly Deferred Coverage

The following items are outside Phase 17 and must not be interpreted as covered by this Lock:

- Real refund/payment provider execution and provider failure recovery.
- Real dispatch reassignment and LBS candidate matching.
- OSS upload, malware/type/size validation, and media evidence binding.
- Durable Playwright multi-app E2E in CI.
- Load, observability, rate-limit, and performance gates.

These map to Phase 18, Phase 20, and Phase 22 respectively.

## 5. Lock Interpretation

Phase 17 coverage proves the local contract, state transitions, city/identity boundaries, persistence, audit timeline, and non-execution guarantees. It does not authorize any external provider or financial execution path.
