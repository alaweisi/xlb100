# SHARDING_KEYS.md — 喜乐帮 / XLB

Phase 1+: primary sharding / partition key is **`city_code`**.

| Domain | Shard key | Phase |
|--------|-----------|-------|
| Orders | `city_code` | Phase 4 |
| Dispatch tasks | `city_code` | Phase 5A |
| Dispatch stream | `city_code` | Phase 5A (`xlb:dispatch:{cityCode}:orders`) |
| Worker task acceptances | `city_code` | Phase 7A |
| Fulfillments | `city_code` | Phase 7A skeleton; Phase 7B lifecycle |
| Ledger accounts, entries, accruals | `city_code` | Phase 8A |
| Settlement batches and items | `city_code` | Phase 8B preparation |
| Marketing campaigns and rule revisions | `city_code` | Phase 29 |
| Coupon definitions, grants and decisions | `city_code` | Phase 29 |
| Coupon reservations, redemptions and compensations | `city_code` | Phase 29 |

Phase 1: single DB (S0); `city_code` enforced at application layer.

Phase 29 remains on the S0 single-database deployment, but every new business
table carries non-null `city_code`, rejects `__global__`, and uses city-leading
lookup/uniqueness keys. Composite foreign keys prevent cross-city assembly of
Campaign, RuleRevision, Coupon, Decision, Order, Platform Delivery and Outbox
evidence. This is a partition-readiness contract, not authorization to deploy
sharding or activate event subscribers.
