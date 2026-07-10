# Phase 17 Order Reverse And Aftersale Foundation Report

Date: 2026-07-10
Status: LOCKED
Scope: order reverse, complaint, repair, liability, compensation intent, and customer-service timeline

## 1. Objective

Phase 17 closes the reverse-order and aftersale workflow gaps identified against Wanshifu, Luban Daojia, and Zhuomuniao:

- Wanshifu-style auditable cancellation, reassignment intent, service remediation, and compensation review.
- Luban-style managed repair visits and operator intervention.
- Zhuomuniao-style customer complaint entry, service-quality categories, transparent case progress, and customer-service records.

The implementation is production-shaped locally but deliberately excludes real payment/refund providers, real map APIs, ledger execution, and dispatch reassignment.

## 2. Implemented Capabilities

### 2.1 Order Reverse

- Customer cancellation, reschedule, and reassignment requests.
- Customer ownership and idempotency enforcement.
- Admin review and separate application step.
- Cancellation through the existing order state machine.
- Reschedule updates to order schedule fields.
- Reassignment audit intent with `dispatchMutation: false`.

### 2.2 Complaints And Customer Service

- Eight complaint categories and three priority levels.
- Customer create, list, detail, and note APIs.
- Admin queue, detail, triage, resolve, reopen, close, and note operations.
- Shared timeline for customer, worker, admin, and system events.

### 2.3 Repair, Liability, And Compensation

- Admin-created repair visits with optional worker assignment.
- Assigned-worker-only repair listing, start, and completion.
- Immutable liability decision with percentage validation.
- Compensation proposal and approval/rejection workflow.
- Hard-coded provider execution state of `not_executed`.

### 2.4 Three Application Surfaces

- Customer: `/customer/aftersale` reverse and complaint workspace.
- Worker: `/worker/repairs` assigned repair lifecycle.
- Admin: `#/aftersale` reverse queue, complaint queue, case operations, and timeline.
- Admin order trace now includes reverse and complaint stages.

## 3. Persistence And Events

Migration `034_phase17_order_reverse_aftersale_complaints.sql` adds six city-scoped tables:

- `order_reverse_requests`
- `aftersale_complaints`
- `aftersale_repair_orders`
- `aftersale_liability_decisions`
- `aftersale_compensation_intents`
- `aftersale_timeline_events`

Outbox contracts include reverse requested/approved/applied, complaint submitted/resolved, repair created/completed, liability decided, and compensation approved events.

## 4. Execution Boundaries

- No WeChat Pay, Alipay, bank, payout, withdrawal, or provider-refund call.
- No ledger, settlement, payment, or payout mutation.
- No dispatch assignment mutation for reassignment requests.
- No real Amap or paid geo API.
- No `city_code = '__global__'` rows.
- No edit to an earlier migration.

## 5. Verification Gate

Formal command:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/check-phase17-migration-verification.ps1
```

Result on 2026-07-10: PASS.

Detailed coverage statement: `docs/reports/PHASE17_TEST_COVERAGE.md`.

Verified:

- Migration 034 is applied exactly once.
- All six Phase 17 tables exist.
- Phase 17 global-city row count is zero.
- Executed compensation-intent count is zero before and after tests.
- Boundary scan passes.
- Five Phase 17 test files pass with 11 tests.
- Backend typecheck and build pass after admin-role compatibility verification.

Covered flow:

- Customer reschedule -> admin approval -> apply -> order schedule update.
- Customer cancel -> admin approval -> apply -> order cancellation.
- Customer complaint -> triage -> liability -> compensation intent -> assigned repair -> resolution -> closure.
- Worker starts and completes only an assigned repair.
- Compensation approval creates no refund request and no ledger accrual.

## 6. Browser Verification

Local browser smoke used the current workspace backend on port 3017:

- Customer aftersale page rendered its reverse and complaint forms and history areas.
- Admin login as `admin-hangzhou` loaded six reverse requests and three complaints without the earlier role mismatch.
- Worker OTP login as `worker-demo-hangzhou` loaded three assigned completed repair visits.

## 7. Residual Work

- Phase 18 owns media evidence and the OSS mock/provider envelope.
- Phase 20 owns real dispatch assignment/reassignment behind the LBS-lite model.
- Phase 21 owns broader operations UI closure and workflow ergonomics.
- Phase 22 owns durable Playwright E2E, observability, security, and performance gates.
- Phase 17 is locked. Phase 18 was not entered during this Lock task.

## 8. Pre-Merge Lock Verification

Lock candidate branch: `codex/phase17-order-reverse-aftersale`

Verification on 2026-07-10:

| Check | Result |
| --- | --- |
| `npx pnpm build` | PASS, 11/11 build tasks |
| `npx pnpm typecheck` | PASS, 17/17 type tasks |
| `npx pnpm test` | PASS, 264 files and 1,081 tests; 1 existing todo |
| `npx pnpm preflight` | PASS through Phase 0-12, ledger replay, and ledger immutability |
| Phase 17 migration gate | PASS, 5 files and 11 tests |
| Migration 034 | Applied exactly once |
| Phase 17 global-city rows | 0 |
| Executed compensation intents | 0 before and after tests |
| Docker infrastructure | MySQL and Redis healthy |
| Migration and seed replay | PASS and idempotent |
| A/W/C browser smoke | PASS |

The preflight run initially exposed five historical Phase 9 runtime scripts that still used removed identity headers and a package-scoped `tsx` invocation that was unavailable in this workspace. The scripts now generate real Bearer tokens with the production token helper and execute the repository-local backend `tsx` command. Two UI gates were also changed from translated display-text matching to behavior-level callback and cursor checks. No backend authorization or business rule was relaxed.

The branch includes the previously uncommitted Phase 16 pricing/standard foundation because Phase 17 was developed on top of that verified dependency. Both migrations remain append-only and the Phase 17 tag will therefore identify the first mainline commit containing the complete Phase 16 dependency plus Phase 17 aftersale foundation.

## 9. Lock Conclusion

- Merged: yes, with `--no-ff`
- Feature commit: `3bf540b`
- Main merge commit: `f8895d0`
- Tag: `xlb-phase17-order-reverse-aftersale`
- Tag target: `f8895d0`
- Branch full tests: 264 files, 1,081 passed, 1 existing todo
- Main post-merge full tests: 264 files, 1,081 passed, 1 existing todo
- Build and typecheck: passed before and after merge
- Architecture preflight: passed before and after merge
- Phase 17 migration gate: passed before and after merge
- Live verification: customer, admin, and worker browser smoke passed
- External execution: no payment, provider refund, ledger, settlement, payout, dispatch assignment, or Amap execution
- Next phase: Phase 18 not entered in this Lock task
