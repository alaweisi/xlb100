# Streams module — Stage 2C-3 reliability boundary

City-scoped Redis Streams for dispatch. **No national/global stream.**

- `cityStreamNames.ts` — `getDispatchStreamName(cityCode)` → `xlb:dispatch:{cityCode}:orders`
- `dispatchStreamPublisher.ts` — bounded XADD and resumable, atomic rebuild publishing
- `dispatchStreamConsumer.ts` — Consumer Group, ACK-after-durable-effect, PEL reclaim and bounded retry
- `dispatchStreamFailureRecorder.ts` — persists terminal dispatch failure in MySQL before Redis DLQ/ACK
- `dispatchStreamRuntime.ts` — Worker-agnostic start/stop runtime; Job Worker wiring remains owned by 2C-1
- `dispatchStreamRebuilder.ts` — active MySQL dispatch state to Redis rebuild
- `outboxEventCatalog.ts` / `outboxRetentionPolicy.ts` — exhaustive event ownership and legal-hold-aware purge eligibility

Dispatch module consumes `event_outbox.order.created` only — payment/order must not import streams.

MySQL `event_outbox` and dispatch tables remain authoritative. Redis Streams are a bounded,
city-scoped acceleration layer and may be rebuilt. A Redis delivery is acknowledged only after
its handler commits an idempotent MySQL effect. Redis DLQ is diagnostic, never the only failure record.
