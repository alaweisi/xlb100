# Streams module — Phase 5A

City-scoped Redis Streams for dispatch. **No national/global stream.**

- `cityStreamNames.ts` — `getDispatchStreamName(cityCode)` → `xlb:dispatch:{cityCode}:orders`
- `dispatchStreamPublisher.ts` — XADD dispatch task messages
- `dispatchStreamConsumer.ts` — skeleton read-only; no worker assignment
- `retryPolicy.ts` / `dlq.ts` — placeholders for Phase 5B+

Dispatch module consumes `event_outbox.order.created` only — payment/order must not import streams.
