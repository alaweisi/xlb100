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

## Seed Runner

- 路径：`db/seed/*.sql`（按文件名排序）
- **幂等**：使用 `ON DUPLICATE KEY UPDATE`

## 本地执行

```powershell
powershell -File scripts/migrate-local.ps1
powershell -File scripts/seed-local.ps1
```

或通过 backend `migrationRunner` / `seedRunner` 模块。
