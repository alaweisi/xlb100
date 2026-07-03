# Worker module — Phase 5B

Read-only worker task pool. **No accept, no assignment, no fulfillment.**

- `workerRepository.ts` — worker profiles + city bindings
- `workerService.ts` — binding validation
- `taskPoolService.ts` — reads `dispatch_tasks` where status=queued (city-scoped)
- `taskPoolRoutes.ts` — `GET /api/worker/task-pool`

Task pool uses DB `dispatch_tasks` as SSOT — does not consume Redis Stream in Phase 5B.

Accept + fulfillment deferred to Phase 7 after Certification/Eligibility (Phase 6).
