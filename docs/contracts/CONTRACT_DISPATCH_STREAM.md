# CONTRACT_DISPATCH_STREAM

## Scope

Phase 5A — city-scoped Redis Stream for dispatch tasks.

## Stream naming

```
xlb:dispatch:{cityCode}:orders
```

Example: `xlb:dispatch:hangzhou:orders`

## Rules

1. **cityCode required** — no stream without city
2. **No national stream** — forbidden: `all`, `global`, `national`, `__global__`
3. **Message fields:** `dispatchTaskId`, `orderId`, `cityCode`, `customerId`, `skuId`, `amount`, `sourceEventId`
4. **Source:** dispatch module consumes `event_outbox.order.paid` only
5. **No worker assignment** in Phase 5A

## Forbidden

- `xlb:dispatch:all:orders`
- `xlb:dispatch:global:orders`
- Payment/order modules writing directly to stream
