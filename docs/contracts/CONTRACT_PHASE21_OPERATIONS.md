# Phase 21 Three-App Operations Contract

Date: 2026-07-10
Status: development candidate

## Customer Operations

All routes require customer Bearer authentication and `x-xlb-city-code`.

| Method | Route | Effect |
| --- | --- | --- |
| GET | `/api/customer/profile` | Read the authenticated customer profile |
| POST | `/api/customer/profile` | Update name and same-scope default city |
| GET | `/api/customer/addresses` | List only the authenticated customer's addresses in the request city |
| POST | `/api/customer/addresses` | Create an idempotent city-scoped service address |
| POST | `/api/customer/addresses/:addressId` | Update an owned same-city address |
| POST | `/api/customer/addresses/:addressId/delete` | Delete an owned same-city address |

Address creation requires `idempotencyKey`. The database unique key on
`(customer_id, city_code, idempotency_key)` guarantees retry safety.

## Worker Operations

Phase 21 UI consumes existing worker APIs without inventing local success:

- location and availability: `/api/worker/location`
- task pool and accept: `/api/worker/task-pool`, `/api/worker/tasks/:id/accept`
- fulfillment and evidence: `/api/worker/fulfillments/*`
- repair cooperation: `/api/worker/aftersale/repair-orders/*`
- receivable balance, bank account, and withdrawal request: `/api/worker/finance/*`, `/api/worker/bank-accounts`, `/api/worker/withdrawal-requests`
- certification submit: `/api/worker/certifications`

## Admin Operations

All routes require an admin app role and a matching `admin_city_scopes` row.

| Method | Route | Effect |
| --- | --- | --- |
| GET | `/api/internal/operations/orders` | List up to 200 city-scoped orders |
| GET | `/api/internal/operations/skus` | List city SKU, price, and standard summaries |
| POST | `/api/internal/operations/skus/:skuId/status` | Enable or disable the canonical city SKU |
| GET | `/api/admin/certifications` | List city-scoped certification applications |
| POST | `/api/admin/certifications/:id/approve` | Approve through the existing state machine and refresh qualifications |
| POST | `/api/admin/certifications/:id/reject` | Reject through the existing state machine |

## Boundaries

- No real payment, refund, settlement, payout, or withdrawal provider execution.
- No real Amap or other external map request.
- No real object-storage provider request.
- Location remains `private_exact`; admin receives only distance, ETA, score, and freshness.
- Phase 22 observability, load, and formal E2E gates are not entered.
