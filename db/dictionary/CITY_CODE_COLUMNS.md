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

## Rules

1. No default nationwide `city_code`
2. Admin queries must filter by scoped `city_code`
3. Canonical form: lowercase `[a-z0-9_-]+`
