# CONTRACT_WORKER_QUALIFICATION

Phase 6 — Service qualification rules and worker qualification records.

## Scope

- `service_qualification_rules`: city + sku + required cert type
- `worker_qualifications`: worker + city + sku eligibility snapshot

## Rules

1. Qualification is scoped by `cityCode` + `skuId`.
2. Refreshed when admin approves certification.
3. Rejected certification does not set `isEligible=true`.

## Not in Phase 6

- Accept, fulfillment, ledger, refund
- Worker assignment on dispatch_tasks

## Tables

- `service_qualification_rules`
- `worker_qualifications` (PK: worker_id, city_code, sku_id)
