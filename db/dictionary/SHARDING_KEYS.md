# SHARDING_KEYS.md — 喜乐帮 / XLB

Phase 1+: primary sharding / partition key is **`city_code`**.

| Domain | Shard key | Phase |
|--------|-----------|-------|
| Orders | `city_code` | Phase 4 |
| Dispatch tasks | `city_code` | Phase 5A |
| Dispatch stream | `city_code` | Phase 5A (`xlb:dispatch:{cityCode}:orders`) |
| Ledger | `city_code` | Phase 6+ |

Phase 1: single DB (S0); `city_code` enforced at application layer.
