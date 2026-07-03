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

**Official catalog:** Phase 3A — formal 16 categories pending user confirmation. See `docs/catalog/OFFICIAL_SERVICE_CATALOG_IMPORT_SPEC.md`. Demo seed (`demo_cleaning_*`) is Phase 3 validation only; Phase 4 requires `007` / `008` official seeds.

## Phase 4+ (placeholder)

Business tables (orders, payments, ledger, etc.) will be added in later phases.
