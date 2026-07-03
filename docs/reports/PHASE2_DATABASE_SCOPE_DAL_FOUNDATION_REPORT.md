# PHASE2_DATABASE_SCOPE_DAL_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**分支：** `phase2-database-scope-dal-foundation`  
**阶段：** Phase 2 — Database Scope + DAL Foundation  
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

**幂等：** `runMigrations()` 重复执行仅 skip，integration 测试通过。

---

## 4. Seed Runner 结果

**脚本：** `scripts/seed-local.ps1` · `backend/src/dal/seedRunner.ts`

| 文件 | 内容 |
|------|------|
| `001_cities.seed.sql` | hangzhou · shanghai · beijing · `__global__` marker |
| `002_admin_city_scopes.seed.sql` | admin-hangzhou · admin-shanghai · admin-global |

**幂等：** `ON DUPLICATE KEY UPDATE`，重复执行不炸库。

---

## 5. db-health 返回

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

## 6. ScopedExecutor 规则

| 函数 | 规则 |
|------|------|
| `assertCityScopedContext` | 无 `cityCode` → 抛 `ScopedExecutorError` (400) |
| `buildCityScopedWhere` | 生成 `city_code = ?` |
| `executeCityScoped` | 在 city 约束下执行 callback |
| `scopedExecutor` | Phase 1 兼容 result 风格 |

---

## 7. AdminQueryGuard 规则

| 函数 | 规则 |
|------|------|
| `fetchAdminCityScopes` | 查 `admin_city_scopes` 表 |
| `assertAdminCityScope` | 无 scope → 403；scope leak → 403 |
| `assertAdminCanAccessCity` | 结合 RequestContext.userId |
| `forbidUnscopedAdminQuery` | 直接抛错 |
| `__global__` marker | global admin 可访问任意 city，但仍须显式指定 city_code 过滤（sync guard） |

---

## 8. 验收命令

| 命令 | 结果 |
|------|------|
| install | ✅ |
| build | ✅ |
| typecheck | ✅ |
| test | ✅ 40 passed · 1 todo |
| preflight | ✅ Phase 0 + 1 + 2 |

---

## 9. 新增测试

| 文件 | 用例 |
|------|------|
| unit/scopedExecutor.test.ts | 5 |
| unit/adminQueryGuard.test.ts | 5 |
| unit/repositoryBase.test.ts | 2 |
| integration/dbHealth.test.ts | 1 |
| integration/migrationRunner.test.ts | 1 |
| security/noRawDbQuery.test.ts | 1 |
| security/adminScopeLeak.test.ts | 6 |
| security/noUnscopedQuery.test.ts | 2 |

---

## 10. preflight 增强

- DAL 核心文件检查
- `scripts/migrate-local.ps1` · `seed-local.ps1` · `db-health.ps1`
- `docs/contracts/CONTRACT_DAL_SCOPE.md`
- Phase 2 architecture doc

---

## 11. 业务越界

✅ 无 — 未实现订单/支付/派单/账本/资质/三端业务页

---

## 12. Commit / Phase 2-Lock

- **可 commit：** 是
- **可进入 Phase 2-Lock：** 是（待用户确认后合并 main）
- **未合并 main**

---

## 13. cities 字段说明

统一使用 **`is_open`**（非 `status`）。`__global__` 为 admin global scope 标记行，`is_open=0`。
