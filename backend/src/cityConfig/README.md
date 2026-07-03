# CityConfig Module — Phase 3

City-level configuration (not orders/payments).

- `cityConfigRepository` — DB access via `RepositoryBase` + `ScopedExecutor`
- `cityConfigService` — read snapshot; admin write via `AdminQueryGuard`
- `GET /api/city-config/current` — requires `x-xlb-city-code`

**Rules:** no `__global__` cityCode · no nationwide fallback
