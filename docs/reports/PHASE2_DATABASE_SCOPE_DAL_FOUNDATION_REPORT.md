# PHASE2_DATABASE_SCOPE_DAL_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**分支：** `phase2-database-scope-dal-foundation` → 已合并 `main`  
**阶段：** Phase 2 — Database Scope + DAL Foundation  
**封版：** Phase 2-Lock  
**日期：** 2026-07-03  

---

## 1. Phase 2 目标

建立 MySQL / Redis 连接、migration/seed runner、RepositoryBase、ScopedExecutor 与 AdminQueryGuard 真实 DB 约束。

**本阶段不做：** CityConfig · Catalog · Pricing · 订单 · 支付 · 派单 · 账本 · 资质 · 退款

---

## 2. MySQL / Redis 连接方式

| 组件 | 库 | 配置来源 |
|------|-----|----------|
| MySQL Pool | `mysql2/promise` | `@xlb/config` env，默认 `127.0.0.1:3306/xlb_local` |
| Redis Client | `ioredis` | `@xlb/config` env，默认 `127.0.0.1:6379` |

入口：`getMysqlPool()` · `getRedisClient()` · `pingMysql()` · `pingRedis()`

---

## 3. Migration Runner 结果

**脚本：** `scripts/migrate-local.ps1` · `backend/src/dal/migrationRunner.ts`

| 版本 | 状态 |
|------|------|
| 000_init | ✅ 已应用 |
| 001_city_foundation | ✅ 已应用 |
| 002_dal_scope_foundation | ✅ 已应用 |
| 003_admin_scope_global_marker | ✅ 已应用（Phase 2-Lock） |

**003 内容：** 移除 `admin_city_scopes` → `cities` FK；清理 `cities` 中误插的 `__global__`。

**幂等：** 重复执行仅 skip，integration 测试通过。

---

## 4. Seed Runner 结果

**脚本：** `scripts/seed-local.ps1` · `backend/src/dal/seedRunner.ts`

| 文件 | 内容 |
|------|------|
| `001_cities.seed.sql` | hangzhou · shanghai · beijing（**仅真实城市**） |
| `002_admin_city_scopes.seed.sql` | admin-hangzhou · admin-shanghai · admin-global（`__global__`） |

**幂等：** `ON DUPLICATE KEY UPDATE`，重复执行不炸库。

---

## 5. cities 表最终内容

| city_code | city_name | is_open |
|-----------|-----------|---------|
| beijing | 北京 | 1 |
| hangzhou | 杭州 | 1 |
| shanghai | 上海 | 1 |

**确认：** `__global__` **不在** `cities` 表。

---

## 6. admin_city_scopes 表最终内容

| admin_user_id | city_code |
|---------------|-----------|
| admin-global | __global__ |
| admin-hangzhou | hangzhou |
| admin-shanghai | shanghai |

**确认：** `__global__` **仅**存在于 `admin_city_scopes`，表示 global admin 权限标记，**不代表真实城市**。

---

## 7. __global__ 最终使用规则

| 规则 | 说明 |
|------|------|
| 不在 cities | `cities` 表只含 hangzhou / shanghai / beijing |
| 仅在 admin_city_scopes | `admin-global` → `__global__` 表示 global admin |
| 非业务 cityCode | `cityCodeSchema` 拒绝 `__global__` 作为业务城市 |
| 禁止全国查询 | global admin 仍须显式指定目标 `cityCode`（403 若无） |
| 无 FK 约束 | migration 003 移除 FK，允许 scope 表独立存储 marker |

---

## 8. db-health 返回

**端点：** `GET /api/system/db-health`（匿名）

```json
{
  "ok": true,
  "mysql": "ok",
  "redis": "ok",
  "database": "xlb_local",
  "phase": "2"
}
```

---

## 9. ScopedExecutor 规则

| 函数 | 规则 |
|------|------|
| `assertCityScopedContext` | 无 `cityCode` → 抛 `ScopedExecutorError` (400) |
| `buildCityScopedWhere` | 生成 `city_code = ?` |
| `executeCityScoped` | 在 city 约束下执行 callback |
| `scopedExecutor` | Phase 1 兼容 result 风格 |

---

## 10. AdminQueryGuard 规则

| 函数 | 规则 |
|------|------|
| `fetchAdminCityScopes` | 查 `admin_city_scopes` 表 |
| `assertAdminCityScope` | 无 scope → 403；scope leak → 403 |
| `assertAdminCanAccessCity` | 结合 RequestContext.userId |
| `forbidUnscopedAdminQuery` | 直接抛错 |
| `__global__` marker | global admin 可访问任意 city，但仍须显式指定 city_code 过滤 |

---

## 11. Phase 2-Lock 复验命令结果

| 命令 | 结果 |
|------|------|
| install | ✅ |
| build | ✅ |
| typecheck | ✅ |
| test | ✅ |
| preflight | ✅ Phase 0 + 1 + 2 |
| migrate-local.ps1 | ✅ |
| seed-local.ps1 | ✅ |
| Docker MySQL / Redis | ✅ healthy |
| db-health curl | ✅ mysql ok / redis ok |

---

## 12. 新增测试

| 文件 | 用例 |
|------|------|
| unit/scopedExecutor.test.ts | 5 |
| unit/adminQueryGuard.test.ts | 5 |
| unit/repositoryBase.test.ts | 2 |
| unit/cityCodeSchema.test.ts | 2 |
| integration/dbHealth.test.ts | 1 |
| integration/migrationRunner.test.ts | 1 |
| security/noRawDbQuery.test.ts | 1 |
| security/adminScopeLeak.test.ts | 6 |
| security/noUnscopedQuery.test.ts | 2 |
| security/noGlobalInCities.test.ts | 2 |

---

## 13. 业务越界

✅ 无 — 未实现订单/支付/派单/账本/资质/三端业务页/CityConfig/Catalog/Pricing

---

## 14. Phase 2-Lock 结论

| 项 | 状态 |
|----|------|
| __global__ 不在 cities | ✅ 已确认 |
| global admin 须显式 cityCode | ✅ 已确认 |
| 合并 main 条件 | ✅ 具备 |
| Tag | `xlb-phase2-database-scope-dal` |

---

## 15. cities 字段说明

统一使用 **`is_open`**（非 `status`）。
