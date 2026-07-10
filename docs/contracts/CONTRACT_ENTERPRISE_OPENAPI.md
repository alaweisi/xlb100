# Enterprise OpenAPI Contract

Phase: 19

## Identity And Scope

Enterprise endpoints use `X-XLB-API-Key`, not the customer/worker/admin Bearer flow. A key resolves one credential, one business client, and one city. The request cannot override either identity with headers or body fields.

Keys are returned once. Persistence contains only SHA-256 hashes and a display prefix. Revoked, expired, or inactive-client keys return `401`; missing scopes return `403`.

## Order Contract

- External order identity is unique by `(city_code, business_client_id, external_order_id)`.
- Idempotency identity is unique by `(city_code, business_client_id, idempotency_key)`.
- A replay returns the same XLB order only when the full request hash and external id agree; conflicting reuse returns `409`.
- Enterprise orders call the existing `OrderService`, official SKU checks, quote snapshot, and `order.created` outbox path.
- An active agreement price replaces the order unit amount while retaining the official SKU, standards, and audit snapshot.
- No payment success, dispatch assignment, refund, ledger, settlement, or payout is created by the enterprise API.

Checked-in specification: `docs/openapi/phase19-enterprise-v1.yaml`.
