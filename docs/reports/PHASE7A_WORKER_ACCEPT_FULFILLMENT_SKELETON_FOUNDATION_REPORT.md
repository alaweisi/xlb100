# PHASE7A_WORKER_ACCEPT_FULFILLMENT_SKELETON_FOUNDATION_REPORT

> Phase 7A — Worker Accept + Fulfillment Skeleton Foundation  
> Branch: `phase7a-worker-accept-fulfillment-skeleton-foundation`  
> Lock commit: `697b9dc` → merged to `main`

## Summary

Phase 7A adds worker accept for eligible workers on queued dispatch tasks, creates `worker_task_acceptances` and fulfillment skeleton, writes `dispatch.accepted` and `fulfillment.created` outbox events. No start/complete/ledger/refund.

## Deliverables

| Area | Path |
|------|------|
| Migration | `db/migrations/010_worker_accept_fulfillment_skeleton_foundation.sql` |
| Worker accept | `backend/src/worker/workerAccept*.ts` |
| Fulfillment skeleton | `backend/src/fulfillment/` |
| Contracts | `CONTRACT_WORKER_ACCEPT.md`, `CONTRACT_FULFILLMENT_SKELETON.md` |

## API

- POST `/api/worker/tasks/:dispatchTaskId/accept`
- GET `/api/worker/fulfillments`
- GET `/api/worker/fulfillments/:fulfillmentId`

## Gate scripts

- check-accept-requires-eligibility.ps1
- check-accept-city-scoped.ps1
- check-fulfillment-skeleton-no-ledger.ps1
- check-no-payment-order-to-accept.ps1
- check-no-fulfillment-complete-in-phase7a.ps1

## Phase 7A construction verification

| Check | Result |
|-------|--------|
| build / typecheck / test / preflight | **245 passed**, preflight Phase 7A passed |
| Gate scripts (5) | all passed |
| migrate-local / seed-local | migration 010 applied |
| Accept API (hangzhou) | ok=true, acceptance.status=accepted, fulfillment.status=accepted, idempotent=false |
| Eligibility (worker-demo-hangzhou / sku_home_daily_2h) | isEligible=true |
| dispatch_tasks.status | accepted |
| worker_task_acceptances | worker-demo-hangzhou, status=accepted |
| fulfillments skeleton | status=accepted, started_at=null, completed_at=null |
| event_outbox | dispatch.accepted + fulfillment.created |
| Repeat accept | idempotent=true |
| Other worker conflict | HTTP 409 |
| POST /complete | HTTP 404 (route not found) |
| order/payment | remain paid, unchanged |
| ledger/settlement/refund | no imports in fulfillment/accept modules |

---

## Phase 7A-Lock re-verification (2026-07-03)

### 1. Engineering commands

| Command | Result |
|---------|--------|
| `npx pnpm build` | passed |
| `npx pnpm typecheck` | passed |
| `npx pnpm test` | **245 passed**, 1 todo |
| `npx pnpm preflight` | Phase 0–7A all passed |

Phase 5B / Phase 6 historical no-accept scripts remain scoped to historical files only; they do not block Phase 7A accept.

### 2. Gate scripts

All 5 Phase 7A gate scripts passed.

### 3. Docker / DB

| Check | Result |
|-------|--------|
| xlb-mysql-local | healthy |
| xlb-redis-local | healthy |
| migrate-local | passed (010 already applied) |
| seed-local | passed |
| `worker_task_acceptances` table | exists |
| `fulfillments` table | exists |
| `dispatch_tasks` columns | no worker_id / assigned_worker_id / accepted_worker_id |
| `fulfillments` columns | has started_at/completed_at (nullable); no settlement_id/ledger_id/refund_id/payout |

Build artifacts `packages/types/src/*.js` removed before lock; not committed.

### 4. Live E2E (accept-lock flow)

| Step | Result |
|------|--------|
| Health / system / db-health | 200, mysql ok, redis ok |
| Create order | `ord_mr51r32r_8bbc7aff` |
| Mock paid + dispatch run-once | `dpt_mr51r33z_12f95777` status=queued, hangzhou, sku_home_daily_2h |
| Eligibility check | isEligible=true |
| Accept | ok=true, idempotent=false |
| acceptanceId | `acc_mr51rdqh_cf7ae24a` |
| fulfillmentId | `ful_mr51rdqh_30bc123d` |

### 5. DB state after accept

| Table | Result |
|-------|--------|
| dispatch_tasks | status=accepted |
| worker_task_acceptances | 1 row, worker-demo-hangzhou, status=accepted |
| fulfillments | 1 row, status=accepted, started_at=NULL, completed_at=NULL |

### 6. event_outbox

| event_type | aggregate_id | city_code | status |
|------------|--------------|-----------|--------|
| dispatch.accepted | dpt_mr51r33z_12f95777 | hangzhou | pending |
| fulfillment.created | ful_mr51rdqh_30bc123d | hangzhou | pending |

Payload includes: dispatchTaskId, orderId, cityCode, workerId, skuId, acceptanceId/fulfillmentId.

### 7. Idempotency

Repeat accept by same worker: ok=true, idempotent=true. acceptance_count=1, fulfillment_count=1.

### 8. Conflict / rejection

| Scenario | HTTP | Notes |
|----------|------|-------|
| worker-demo-shanghai (shanghai city, cross-city) | 404 | task not found in shanghai scope |
| worker-demo-hangzhou-alt (same city, already accepted) | 409 | task already accepted |
| worker-demo-hangzhou-alt on fresh queued task (not eligible) | 403 | no acceptance/fulfillment created |

### 9. Endpoint absence

| Endpoint | HTTP |
|----------|------|
| POST /api/worker/fulfillments/:id/complete | 404 |
| POST /api/worker/fulfillments/:id/start | 404 |

### 10. order/payment unchanged

order.status=paid, payment_order.status=paid. No secondary payment/ledger/settlement/refund.

### 11. Boundary search (rg)

| Scope | Result |
|-------|--------|
| worker/fulfillment → ledger/settlement/refund | no imports |
| payment/order → workerAccept/fulfillment | no imports |
| fulfillment/worker → /complete, /start routes | none |
| migration 010 → dispatch_tasks worker columns | none added |

### 12. Merge readiness

| Item | Status |
|------|--------|
| Ready to merge main | yes |
| Phase 7B entered | no |
| Tag after merge | `xlb-phase7a-worker-accept-fulfillment-skeleton` |

## Phase 7B (not in scope)

- fulfillment start / complete
- evidence upload
- ledger / settlement triggers
