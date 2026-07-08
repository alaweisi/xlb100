# P1 Stage 1 - Worker readonly wiring migration

Date: 2026-07-08

## Scope

This round only migrated the worker-side readonly wiring:

- `packages/api-client/src/worker.ts`
  - Added `getTaskPool()` for `GET /api/worker/task-pool`.
  - Kept api-client response types inline, consistent with the existing package boundary documented in `.cursor/skills/xlb-context-map/reference.md`.
  - `apps/worker` consumes shared `@xlb/types` types (`WorkerTaskPoolItem`, `Fulfillment`) and does not duplicate those app-local types.
- `apps/worker/package.json`
  - Added workspace dependency on `@xlb/api-client`.
- `apps/worker/src/app/App.tsx`
  - Replaced the guardrail-only worker shell with real readonly rendering for task pool, fulfillment list, and fulfillment detail.
  - Uses header identity: `x-xlb-app-type=worker`, `x-xlb-role=worker`, `x-xlb-city-code=hangzhou`, `x-xlb-user-id=worker-demo-hangzhou`.
  - Keeps wallet/profile/certification as readonly/not-wired notes where relevant.
- `apps/worker/vite.config.ts`
  - Added a local dev-only `/api` proxy through `XLB_WORKER_PROXY_TARGET` so browser UAT can call the backend without changing backend CORS.

## Explicit Boundary

Accept / start / complete are still disabled in this round:

- `Accept` buttons are rendered disabled and do not call `POST /api/worker/tasks/:dispatchTaskId/accept`.
- `Start service` is rendered disabled and does not call `POST /api/worker/fulfillments/:fulfillmentId/start`.
- `Complete service` is rendered disabled and does not call `POST /api/worker/fulfillments/:fulfillmentId/complete`.

Opening these three write operations is deferred to the next P1 stage.

## Manual UAT

Backend was started locally on port `3100` with:

```text
AUTO_RUN_ENABLED=true
AUTO_RUN_INTERVAL_MS=2000
AUTO_RUN_CITY_CODES=hangzhou
BACKEND_PORT=3100
```

The real HTTP flow was executed:

```text
POST http://127.0.0.1:3100/api/orders
POST http://127.0.0.1:3100/api/payments/orders
POST http://127.0.0.1:3100/api/payments/mock-webhook
```

Observed result:

```json
{
  "orderId": "ord_mrc4f1bx_5ba94318",
  "skuId": "sku_home_daily_2h",
  "amount": 89,
  "paymentOrderId": "pay_mrc4f1dp_3947d563",
  "paymentStatus": "paid",
  "scheduledAt": "2026-07-09T01:00:00.000Z"
}
```

Auto-run generated a real queued dispatch task:

```text
dpt_mrc4f5fp_c4e5a38b
city_code: hangzhou
order_id: ord_mrc4f1bx_5ba94318
sku_id: sku_home_daily_2h
amount: 89.00
status: queued
```

The local database already had more than 100 historical queued Hangzhou tasks, while the backend task-pool endpoint returns `ORDER BY created_at ASC LIMIT 100`. For browser verification only, this newly generated local task's `created_at` was moved earlier so it would appear in the first page without changing its status or backend code.

Worker browser UAT then opened:

```text
http://127.0.0.1:5174/worker/?cityCode=hangzhou&workerId=worker-demo-hangzhou
```

The worker task pool showed the target real task row:

```text
dpt_mrc4f5fp_c4e5a38b | ord_mrc4f1bx_5ba94318 | sku_home_daily_2h | CNY 89.00 | queued | Accept
```

Browser verification also confirmed:

- task pool source text: `GET /api/worker/task-pool`
- `Accept` buttons: 100 disabled, 0 enabled
- fulfillment list page renders real `GET /api/worker/fulfillments` rows
- fulfillment detail page renders real detail for `ful_mrc0wr2l_0fdad4a5`
- `Start service` and `Complete service` buttons are disabled on the detail page

## Verification

```text
pnpm turbo run typecheck
Tasks: 17 successful, 17 total
```

```text
pnpm turbo run build
Tasks: 11 successful, 11 total
```

First serial Vitest attempt failed because the manual-UAT backend auto-run process was still running and interfered with settlement integration tests (`prepare-once` returned `processed:0,batch:null`). After stopping the port `3100` backend / auto-run process, the same command passed:

```text
pnpm exec vitest run --pool=forks --poolOptions.forks.singleFork
Test Files 255 passed (255)
Tests 1048 passed | 1 todo (1049)
Duration 499.23s
```
