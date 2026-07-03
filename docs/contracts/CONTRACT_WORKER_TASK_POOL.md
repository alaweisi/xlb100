# CONTRACT_WORKER_TASK_POOL

## Endpoint

`GET /api/worker/task-pool`

## Headers (required)

| Header | Value |
|--------|-------|
| x-xlb-app-type | worker |
| x-xlb-role | worker |
| x-xlb-city-code | city code |
| x-xlb-user-id | worker id |

## Behavior

1. Validate worker is bound to `cityCode` via `worker_city_bindings`
2. Return `dispatch_tasks` where `status = queued` and `city_code = cityCode`
3. **Read-only** — no status change, no accept, no assignment

## Response

```json
{
  "ok": true,
  "cityCode": "hangzhou",
  "tasks": [{ "dispatchTaskId", "orderId", "skuId", "amount", "streamName", "status", "createdAt" }]
}
```

## Forbidden in Phase 5B

- POST accept endpoints
- assignedWorkerId / acceptedWorkerId
- Redis stream consumption
- fulfillment side effects
