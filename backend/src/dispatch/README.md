# Dispatch module — Phase 5A

Consumes `event_outbox.order.created` only. Creates `dispatch_tasks` and publishes to city-scoped Redis Stream.

**Phase 5A does NOT:**
- Assign workers (`workerMatcher` is placeholder)
- Fulfillment / ledger / settlement / refund
- Accept direct calls from payment/order modules

**Phase 6+:** worker eligibility after certification audit.
