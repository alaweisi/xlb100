# Fulfillment Evidence Contract

Phase: 18

## Evidence Model

Evidence nodes are `arrival`, `before_service`, `diagnosis`, `material`, `after_service`, and `completion`.

Every evidence record binds to one city, order, fulfillment, media asset, and worker. A record may additionally bind to a Phase 17 complaint only when that complaint belongs to the same city and order. `media_assets` mirrors the same business bindings so the binary envelope cannot become an unowned attachment.

## Customer Confirmation

Worker completion creates one `pending` confirmation per city and fulfillment. The record contains a checksum snapshot of all evidence available at completion. Additional evidence may refresh the snapshot while confirmation remains pending.

State machine:

- `pending -> confirmed`
- `pending -> disputed`
- `confirmed` and `disputed` are terminal

Confirmation requires at least one `after_service` or `completion` node. A dispute requires a customer-owned Phase 17 complaint for the same city and order plus a note. A dispute appends `fulfillment.customer_disputed` to the complaint timeline. Once terminal, worker evidence is frozen.

## Access Contract

- Worker upload/list requires the authenticated worker to own the fulfillment in the request city.
- Customer list/confirm/content requires ownership of the order in the request city.
- Admin list/content requires the admin app and role `admin` or `operator`.
- Cross-city lookup returns no media subject. Same-city non-owner access is forbidden.

## API

Worker:

- `POST /api/worker/fulfillments/:fulfillmentId/evidence`
- `GET /api/worker/fulfillments/:fulfillmentId/evidence`

Customer:

- `GET /api/customer/orders/:orderId/fulfillment-evidence`
- `POST /api/customer/fulfillments/:fulfillmentId/customer-confirmation`

Admin and authenticated content:

- `GET /api/internal/orders/:orderId/fulfillment-evidence`
- `GET /api/media-assets/:mediaAssetId/content`

## Non-Execution Boundary

Evidence actions do not mutate payment, refund, ledger, settlement, payout, or dispatch assignment state. Object storage is local/mock only under `CONTRACT_OBJECT_STORAGE_PROVIDER.md`.
