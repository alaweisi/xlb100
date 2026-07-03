# GLOBAL_TABLES.md — 喜乐帮 / XLB

Phase 2 global tables (no per-order city_code requirement on the table itself):

| Table | Purpose | Notes |
|-------|---------|-------|
| `schema_migrations` | Migration tracking | No city_code |
| `cities` | City registry SSOT | PK is `city_code` |
| `admin_city_scopes` | Admin RLS scope | FK to `cities.city_code` |

Future business tables (Phase 3+) are **not** global — they must include `city_code`.

## cities 字段

- `city_code` — PK, canonical lowercase
- `city_name` — display name
- `is_open` — 1=open, 0=closed (**不是 status**)
