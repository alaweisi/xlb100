# CONTRACT_FULFILLMENT_SKELETON

Phase 7A — Fulfillment skeleton created on accept only.

## Status

Phase 7A creates `status=accepted` only. `started_at` and `completed_at` remain null.

## API (read-only in Phase 7A)

- GET /api/worker/fulfillments
- GET /api/worker/fulfillments/:fulfillmentId

## Not in Phase 7A

POST start, POST complete, evidence upload, ledger, settlement, refund.

Phase 7B will expose start/complete.
