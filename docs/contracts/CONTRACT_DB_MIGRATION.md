# CONTRACT_DB_MIGRATION.md — 喜乐帮 / XLB

## Migration Runner

- 路径：`db/migrations/*.sql`（按文件名排序）
- 记录表：`schema_migrations`
- 已记录的 migration **不会重复执行**

## 当前 migrations

| 版本 | 文件 |
|------|------|
| 000_init | schema_migrations 表 |
| 001_city_foundation | cities · admin_city_scopes |
| 002_dal_scope_foundation | 索引增强 |
| 003_admin_scope_global_marker | 移除 admin FK；清理 cities 中误插的 `__global__` |
| 004_cityconfig_catalog_pricing_foundation | city_configs · catalog · price_rules |

## Seed Runner

- 路径：`db/seed/*.sql`（按文件名排序）
- **幂等**：使用 `ON DUPLICATE KEY UPDATE`

## 本地执行

```powershell
powershell -File scripts/migrate-local.ps1
powershell -File scripts/seed-local.ps1
```

或通过 backend `migrationRunner` / `seedRunner` 模块。

## Phase 29 migration 057 contract

- File: `db/migrations/057_phase29_marketing_coupon.sql`.
- Predecessor: locked migration `056_phase28_review_reputation`.
- Append-only rule: migrations `000` through `056` remain immutable.
- Schema-only rule: `057` may insert only its `schema_migrations` marker. It
  must not seed campaigns/coupons, activate subscribers, create deliveries,
  replay history, backfill business data, or create a scheduler/trigger.
- Replay rule: applying the runner twice after fresh, `000`-`056` upgrade, or
  interrupted partial DDL must converge on one marker and the same nine empty
  Phase 29 tables.
- Isolation rule: all nine Phase 29 tables require real-city `city_code` and
  all evidence foreign keys use `RESTRICT`, never `CASCADE`.
- Financial-evidence rule: composite UNIQUE/FK pairs must prevent disagreement
  between Rule revision/content hash, Grant and Decision rule evidence,
  Decision and Reservation amount, Reservation and Redemption amount, or source
  Redemption and Compensation amount. Direct SQL contradictions must fail.
- Verification command: `pnpm test:migration:phase29`.
