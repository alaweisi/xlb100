# CITY_CODE_COLUMNS.md — 喜乐帮 / XLB

Phase 1 city foundation. All city-scoped business tables (Phase 2+) **must** include:

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| `city_code` | VARCHAR(64) | Yes | Canonical lowercase; FK to `cities.city_code` |

## Phase 1 tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `cities` | PK `city_code` | Global registry; uses `is_open` (not `status`) |
| `admin_city_scopes` | FK `city_code` | Admin RLS scope |

## Phase 5A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `dispatch_tasks` | required FK | One task per order; city-scoped Redis stream |
| `dispatch_offers` | required FK | Simulated offer rows per candidate worker |
| `dispatch_events` | required FK | City-scoped dispatch timeline events |

## Phase 7A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `worker_task_acceptances` | required FK | One acceptance per dispatch_task; worker accept record |
| `fulfillments` | required FK + non-global check | One per acceptance / dispatch_task; lifecycle remains city scoped |

## Rules

## Phase 8A tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `ledger_accounts` | required FK + non-global check | Account identity is unique inside a city |
| `ledger_entries` | required FK + non-global check | Accrual entry source stays city scoped |
| `ledger_accruals` | required FK + non-global check | Completed fulfillment accrual snapshot |

## Phase 8B tables with city_code

| Table | city_code column | Notes |
|-------|------------------|-------|
| `settlement_batches` | required FK + non-global check | One preparation run inside one city |
| `settlement_items` | required FK + non-global check | Accrual and batch remain in the same city |

1. No default nationwide `city_code`
2. Admin queries must filter by scoped `city_code`
3. Canonical form: lowercase `[a-z0-9_-]+`
