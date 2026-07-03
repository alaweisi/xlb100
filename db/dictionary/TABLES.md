# TABLES.md — 喜乐帮 / XLB

## Phase 1 tables

| Table | Purpose |
|-------|---------|
| `schema_migrations` | Migration tracking (000_init) |
| `cities` | City registry SSOT (`is_open` flag) |
| `admin_city_scopes` | Admin city scope (RLS foundation) |

## Phase 3 tables (city-scoped config)

| Table | Purpose | city_code |
|-------|---------|-----------|
| `city_configs` | City-level config snapshot | required PK |
| `service_categories` | Service category per city | required |
| `service_items` | Service item per city | required |
| `service_skus` | SKU per city | required |
| `price_rules` | Price rule per city + sku | required |

**Rules:** all Phase 3 config tables require `city_code`. No `__global__`. No nationwide fallback.

**Official catalog:** Phase 3A-1 — 16 categories / 492 SKUs imported from `docs/catalog/服务类目完整清单.tsv`. Demo seed (`demo_cleaning_*`) disabled by `006_disable_demo_catalog.seed.sql`.

## Phase 4+ (placeholder)

Business tables (orders, payments, ledger, etc.) will be added in later phases.
