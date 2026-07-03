# PHASE5B_WORKER_POOL_TASKPOOL_READINESS_FOUNDATION_REPORT

> Phase 5B — Worker Pool + Task Pool Readiness Foundation  
> Branch: `phase5b-worker-pool-taskpool-readiness-foundation`

## Summary

Phase 5B establishes worker profiles, city bindings, and read-only task pool API. Workers see queued `dispatch_tasks` in their bound city only. No accept, no assignment, no fulfillment.

## Deliverables

| Area | Path |
|------|------|
| Migration | `db/migrations/008_worker_pool_taskpool_readiness_foundation.sql` |
| Seed | `db/seed/009_worker_demo.seed.sql` |
| Worker module | `backend/src/worker/` |
| Contracts | `CONTRACT_WORKER_TASK_POOL.md`, `CONTRACT_WORKER_PROFILE.md` |

## API

- `GET /api/worker/task-pool` — read-only queued tasks for bound worker/city

## Gate scripts

- `check-worker-taskpool-readonly.ps1`
- `check-no-worker-accept-in-phase5b.ps1`
- `check-no-fulfillment-in-worker-phase5b.ps1`
- `check-worker-taskpool-city-scoped.ps1`

## Not in Phase 5B

Accept, assignment, fulfillment, certification, ledger, app UI.

## Verification

| Check | Result |
|-------|--------|
| build / typecheck / test / preflight | passed (181 tests) |
| Gate scripts (4) | all passed |
| Migration 008 + seed 009 | applied |
| GET /api/worker/task-pool (hangzhou) | ok=true, queued tasks returned |
| Unbound city (shanghai) | 403 |
| Missing cityCode | 400 |
| dispatch_tasks status unchanged | queued |
| No worker fields on dispatch_tasks | confirmed |

---

## Phase 5B-Lock Re-verification (2026-07-03)

### Git state at lock start

| Item | Value |
|------|-------|
| Branch | `phase5b-worker-pool-taskpool-readiness-foundation` |
| Base commit | `0a4f06a` |
| Working tree | clean at lock start |

### Engineering commands

| Command | Result |
|---------|--------|
| `npx pnpm build` | passed (after `WorkerRepository` constructor fix) |
| `npx pnpm typecheck` | passed |
| `npx pnpm test` | **181 passed**, 1 todo (182 total) |
| `npx pnpm preflight` | passed (Phase 0–5B all green) |

### Gate scripts

| Script | Result |
|--------|--------|
| `check-worker-taskpool-readonly.ps1` | passed |
| `check-no-worker-accept-in-phase5b.ps1` | passed |
| `check-no-fulfillment-in-worker-phase5b.ps1` | passed |
| `check-worker-taskpool-city-scoped.ps1` | passed |

Confirmed: task pool reads `dispatch_tasks` only; no status mutation; no accept endpoint; no worker_id write; no fulfillment import; no certification/eligibility logic; queries city-scoped.

### Docker / DB

| Check | Result |
|-------|--------|
| `xlb-mysql-local` | healthy |
| `xlb-redis-local` | healthy |
| `migrate-local.ps1` | passed (008 already applied) |
| `seed-local.ps1` | passed (009 worker demo applied) |

**Worker tables:** `worker_profiles`, `worker_city_bindings`, `worker_online_status` — all present.

**Demo worker city bindings:**

| worker_id | city_code | is_enabled |
|-----------|-----------|------------|
| worker-demo-beijing | beijing | 1 |
| worker-demo-hangzhou | hangzhou | 1 |
| worker-demo-shanghai | shanghai | 1 |

**dispatch_tasks columns:** no `worker_id`, `assigned_worker_id`, or `accepted_worker_id`.

### Backend health

| Endpoint | Status |
|----------|--------|
| `GET /health` | 200, phase=5B |
| `GET /api/system/status` | 200, foundation=worker-pool-taskpool-readiness |
| `GET /api/system/db-health` | 200, mysql=ok, redis=ok |

### Queued dispatch_task preparation (Phase 4 + 5A flow)

| Step | Result |
|------|--------|
| Create order (`customer-worker-lock-003`, hangzhou) | `ord_mr4zz8i7_dda22e0f` |
| Create payment order | `pay_mr4zz8jc_87d69853` |
| Mock webhook paid | ok=true |
| Dispatch run-once | processed at run 1 |
| DB dispatch_task | `dpt_mr4zz8k4_28f9999d`, city_code=hangzhou, status=**queued** |

### Worker Task Pool API verification

| Scenario | Expected | Actual |
|----------|----------|--------|
| hangzhou worker + hangzhou city | 200, ok=true, tasks include queued task | passed (`ord_mr4zz8i7_dda22e0f` in tasks) |
| hangzhou worker + shanghai city (unbound) | 403 | **403** |
| worker, no cityCode header | 400 | **400** |
| customer appType/role | 403 | **403** |
| After task-pool read, dispatch_tasks.status | still queued | **queued** (unchanged) |

### Boundary grep (no real logic)

| Search scope | accept/assignment | fulfillment | certification | ledger/refund |
|--------------|-------------------|-------------|---------------|---------------|
| `backend/src/worker` | none | none | none | none |
| `backend/src/dispatch` | `assignWorker: false` only (strategy flag) | none | none | none |
| `db/migrations/008_*` | none | none | — | — |
| `packages/types/src/worker.ts`, `taskPool.ts` | — | — | none | — |

### Lock fix applied during re-verification

- `backend/src/worker/workerRepository.ts`: added public `constructor(pool?: Pool)` calling `super(pool)` — required for build/typecheck (protected `RepositoryBase` constructor).

### Merge readiness

**Yes** — all Phase 5B-Lock checks passed. Ready to merge `main` and tag `xlb-phase5b-worker-pool-taskpool-readiness`.

**Do not enter Phase 6** until explicitly requested. Phase 5B scope: read-only task pool only; no accept, fulfillment, certification, ledger, or app UI changes.
