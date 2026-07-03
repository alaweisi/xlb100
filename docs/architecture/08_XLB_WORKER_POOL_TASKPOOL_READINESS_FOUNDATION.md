# 08 — XLB Worker Pool Task Pool Readiness Foundation

## Phase 5B scope

Worker profiles, city bindings, and **read-only** task pool API.

## Architecture

```
dispatch_tasks (queued, city-scoped)
        ↓ read-only
GET /api/worker/task-pool
        ↓
worker sees tasks in bound city only
```

## Rules

1. Task pool SSOT = `dispatch_tasks` DB (not Redis Stream)
2. No Redis stream consume/ACK in Phase 5B
3. No accept, no worker assignment on dispatch_tasks
4. Worker must be bound via `worker_city_bindings`
5. City-scoped query mandatory

## Roadmap

| Phase | Capability |
|-------|------------|
| 5B | Task pool read-only |
| 6 | Certification / Eligibility |
| 7 | Accept + Fulfillment |

## Not in Phase 5B

Accept, fulfillment, ledger, certification audit, app UI changes.
