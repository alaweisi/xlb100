# Enterprise Webhook Contract

Phase: 19

## Events And Delivery

Subscriptions select an allowlisted set of existing order, fulfillment, evidence, confirmation, and aftersale outbox events. A delivery is unique by city, subscription, and event.

Payloads include event id, type, occurrence time, business client id, and original outbox data. `X-XLB-Signature` is HMAC-SHA256 over `<timestamp>.<raw-json>` and the signing secret is returned once. The encrypted secret is stored with AES-GCM using deployment secret material.

## Provider Truthfulness

- `mock://success` produces `delivered_mock` with `externalProviderExecuted=false`.
- `mock://fail` produces `failed_mock` and retry state with `externalProviderExecuted=false`.
- HTTPS delivery is explicit, performs a real external call, and records status/body in `delivered_https` or `failed_https` envelopes.
- HTTP, credentials in URLs, custom ports, localhost, and private/resolved-private addresses are rejected.

## Retry

Failures transition to `retry_wait` with exponential delay. Manual retry is audited by the persisted attempt count. The fifth failed attempt becomes `dead_letter`; successful delivery is terminal and idempotent.
