# SHARDING_KEYS.md — 喜乐帮 / XLB

Phase 1+: primary sharding / partition key is **`city_code`**.

| Domain | Shard key | Phase |
|--------|-----------|-------|
| Orders | `city_code` | Phase 3+ |
| Dispatch stream | `city_code` | Phase 4+ |
| Ledger | `city_code` | Phase 5+ |

Phase 1: single DB (S0); `city_code` enforced at application layer.
