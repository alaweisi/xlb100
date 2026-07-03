# 09 — XLB Certification + Worker Eligibility Foundation (Phase 6)

## Purpose

Establish DB-backed worker certification, admin review, service qualification rules, and eligibility computation. Phase 6 answers: *can this worker serve this SKU in this city?*

## In scope

1. `worker_certifications` — apply, pending, approve, reject
2. `service_qualification_rules` — sku required cert types per city
3. `worker_qualifications` — eligibility snapshot per worker/city/sku
4. `certMatcher` / `workerDispatchEligibility` — compute eligibility
5. APIs: submit cert, admin approve/reject, GET eligibility

## Out of scope (Phase 6)

| Forbidden | Phase |
|-----------|-------|
| Worker accept | Phase 7 |
| Fulfillment | Phase 7+ |
| Ledger / settlement / refund | Later |
| App UI changes | N/A |
| dispatch_tasks mutation | Never in Phase 6 |
| assigned_worker_id / accepted_worker_id | Phase 7+ |

## Architecture

```
worker POST certification → worker_certifications (pending)
admin approve → approved → refresh worker_qualifications
GET eligibility → certMatcher + rules → isEligible (read-only)
task pool (Phase 5B) → still read-only dispatch_tasks
```

## Phase 7 gate

Accept in Phase 7 **must** check `WorkerDispatchEligibility.isEligible` before allowing task accept. Phase 6 only provides the eligibility foundation.

## City scope

- All certification / qualification tables require `city_code`
- Admin review uses AdminQueryGuard
- No `__global__` in certification data

## Task pool

`GET /api/worker/task-pool` unchanged — read-only queued tasks, no assignment.
