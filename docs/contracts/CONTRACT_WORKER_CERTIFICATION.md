# CONTRACT_WORKER_CERTIFICATION

Phase 6 — Worker certification apply and admin review. DB-backed; not frontend-only state.

## Scope

- Worker submits certification application (`pending`)
- Admin approves or rejects within city scope
- Status transitions: `pending → approved | rejected`; `approved → expired`

## Not in Phase 6

- Accept / assignment
- Fulfillment / ledger / refund
- Modifying `dispatch_tasks`

## API

### POST /api/worker/certifications

Headers: `x-xlb-app-type: worker`, `x-xlb-role: worker`, `x-xlb-city-code`, `x-xlb-user-id`

Body: `{ certType, certName }`

Creates `worker_certifications` row with `status=pending`.

### POST /api/admin/certifications/:certificationId/approve

Admin city scope required via AdminQueryGuard.

### POST /api/admin/certifications/:certificationId/reject

Body: `{ reason }` (required).

## Tables

- `worker_certifications` — all rows must have `city_code`; no `__global__`
