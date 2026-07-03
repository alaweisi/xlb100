# CONTRACT_EVENT_OUTBOX.md — Phase 4

## Scope

Transactional outbox for domain events. Phase 4 writes only; Phase 5 publishes/consumes.

## Event types

- `order.created`
- `order.paid`
- `payment.paid`

## Rules

1. Every event has `city_code` (no `__global__`).
2. Status: `pending` | `published` | `failed`.
3. Payload JSON must be serializable.
4. Phase 4 `eventPublisher` may list pending events only.
5. Handlers must not invoke dispatch.

## order.paid payload

- orderId, cityCode, customerId, skuId, amount, paidAt
