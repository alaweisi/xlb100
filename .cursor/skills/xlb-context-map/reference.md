# XLB Context Map — Reference

## Monorepo layout (current)

```
apps/customer|worker|admin/   # Vite shells — minimal Phase 0–8C UI
packages/types/               # @xlb/types — single source of types
packages/validators/          # Zod schemas
packages/api-client/          # HTTP client (inline response types, no @xlb/types import)
packages/config/              # env, cities, feature flags
backend/src/                  # All business logic
db/migrations/                # Sequential, append-only
db/dictionary/                # TABLES, CITY_CODE, SHARDING
docs/contracts/               # API/entity contracts
docs/architecture/            # Phase foundation docs
docs/reports/                 # Phase reports + Lock evidence
scripts/check-*.ps1           # Phase gate scripts
tests/unit|integration|contract|security/
```

## Backend modules (existence @ main 8B)

| Directory | Status |
|-----------|--------|
| context, city, cityConfig, catalog, pricing | Foundation |
| order, payment, events, streams | Phase 4 |
| dispatch | Phase 5A |
| worker | Phase 5B + 7A |
| compliance | Phase 6 |
| fulfillment | Phase 7A + 7B |
| ledger | Phase 8A |
| settlement | Phase 8B (+ 8C on branch) |
| aftersale, audit, providers | Mostly README / placeholder |
| gateway, observability, dal | Shared infra |

## Apps (三端)

| App | Path | API access |
|-----|------|------------|
| Customer | `apps/customer/` | `@xlb/api-client` customer |
| Worker | `apps/worker/` | `@xlb/api-client` worker |
| Admin | `apps/admin/` | `@xlb/api-client` admin |

Phase constraint: **no business page implementation** unless phase explicitly allows.

## Multi-city rules (read before any DB/API change)

- Header: `x-xlb-city-code` (canonical lowercase)
- All business tables: `city_code` column — see `db/dictionary/CITY_CODE_COLUMNS.md`
- Queries: `buildCityScopedWhere(cityCode)` — never `__global__` for business data
- Admin: scoped via `admin_city_scopes`

## Test layout

| Layer | Path | When to add |
|-------|------|-------------|
| unit | `tests/unit/` | pure logic, state machines |
| integration | `tests/integration/` | needs MySQL (`XLB_SKIP_DB_TESTS=1` skips) |
| contract | `tests/contract/` | schema/enum alignment |
| security | `tests/security/` | gate scripts + boundary |

## Migrations (append only)

Latest on record: `012` ledger, `013` settlement prep, `014` settlement confirm (8C branch).
Never modify applied migration files.
