# CONTRACT_WORKER_ELIGIBILITY

Phase 6 — Worker dispatch eligibility query (read-only computation).

## Scope

Compute whether a worker is eligible for a given `cityCode + skuId` based on approved certifications and qualification rules.

## API

### GET /api/worker/eligibility?skuId=

Headers: worker app, worker role, city code, user id.

Response:

```json
{
  "ok": true,
  "eligibility": {
    "workerId": "...",
    "cityCode": "hangzhou",
    "skuId": "sku_home_daily_2h",
    "isEligible": true,
    "reasons": []
  }
}
```

## Phase 7 prerequisite

**Phase 7 accept must depend on eligibility.** Workers cannot accept tasks without `isEligible=true` for the order's city and SKU. This contract defines the eligibility gate only; accept is not implemented in Phase 6.

## Boundaries

- Does not modify `dispatch_tasks`
- Does not assign workers
- Task pool remains read-only
