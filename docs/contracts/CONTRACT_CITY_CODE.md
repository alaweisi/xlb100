# CONTRACT_CITY_CODE.md — 喜乐帮 / XLB

## Canonical format

```
^[a-z0-9_-]+$
```

- Lowercase only
- Length: 1–64 characters
- Allowed: letters, digits, hyphen, underscore

## Normalization

All incoming `x-xlb-city-code` values pass through `cityCanonicalizer`:

1. Trim whitespace
2. Lowercase

## Seeded cities (Phase 1)

| city_code | city_name |
|-----------|-----------|
| hangzhou | 杭州 |
| shanghai | 上海 |
| beijing | 北京 |

Unknown `city_code` → **400 Bad Request**

## Rules

1. **No default nationwide** — missing city_code on scoped routes is rejected
2. **Admin RLS** — admin roles scoped to header city_code (Phase 1 skeleton)
3. **DB SSOT** — `cities` table in `001_city_foundation.sql`

## Sharding

Primary partition key for future domains: `city_code`
