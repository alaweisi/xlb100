# PHASE1_REQUEST_CONTEXT_CITY_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**路径：** `G:\xlb100`  
**分支：** `phase1-request-context-city-foundation`  
**阶段：** Phase 1 — RequestContext + City Foundation  
**日期：** 2026-07-03  

---

## 1. Phase 1 目标

建立 RequestContext + City 地基，不写业务逻辑。

---

## 2. RequestContext 字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `traceId` | string | 请求追踪 ID |
| `appType` | AppType | 应用类型 |
| `role` | Role | 角色 |
| `cityCode` | CityCode? | 城市代码（scoped 路由必填） |
| `userId` | string? | 用户 ID |
| `requestStartedAt` | string (ISO) | 请求开始时间 |
| `requestId` | string? | 默认 = traceId |
| `correlationId` | string? | 默认 = traceId |

---

## 3. Header 规范

| Header | 必填 | 说明 |
|--------|------|------|
| `x-xlb-trace-id` | 否 | 缺失时服务端自动生成 UUID |
| `x-xlb-app-type` | 是* | customer / worker / admin / oa / dashboard |
| `x-xlb-role` | 是* | customer / worker / admin / operator / auditor |
| `x-xlb-city-code` | 路由依赖 | 城市 scoped 路由必填 |
| `x-xlb-user-id` | 否 | 用户标识 |

\* context 感知路由必填

---

## 4. CityCode 规则

- 格式：`^[a-z0-9_-]+$`（小写，2–64 字符）
- 规范化：`trim` + `toLowerCase`
- 种子城市：`hangzhou` · `shanghai` · `beijing`
- 未知城市 → 400
- 缺失 city_code（scoped 路由）→ 400
- 禁止默认全国

---

## 5. 新增 migration

`db/migrations/001_city_foundation.sql`

- `cities` — 城市注册表
- `admin_city_scopes` — Admin 城市 scope（RLS 地基）

`db/seed/cities.seed.sql` — 三城 seed

---

## 6. 新增文件清单

### packages/types
- `src/headers.ts`

### backend/src/context
- `traceId.ts`
- `requestContext.ts`
- `requestContextMiddleware.ts`

### backend/src/city
- `cityCanonicalizer.ts`
- `cityResolver.ts`
- `cityRouter.ts`
- `cityScopeResolver.ts`

### backend/src/gateway
- `appTypeGuard.ts`
- `authz.ts`

### backend/src/dal
- `scopedExecutor.ts`
- `adminQueryGuard.ts`

### db
- `migrations/001_city_foundation.sql`
- `seed/cities.seed.sql`

### tests
- `unit/cityResolver.test.ts`
- `contract/requestContext.contract.test.ts`
- `security/noMissingCityCode.test.ts`
- `security/adminScopeLeak.test.ts`

### docs
- `contracts/CONTRACT_REQUEST_CONTEXT.md`
- `contracts/CONTRACT_CITY_CODE.md`
- `architecture/03_XLB_REQUEST_CONTEXT_CITY_FOUNDATION.md`

---

## 7. 修改文件清单

- `packages/types/src/requestContext.ts` · `city.ts` · `index.ts`
- `packages/validators/src/*`
- `packages/config/src/cities.ts` · `index.ts`
- `backend/src/app.ts`
- `backend/package.json` · `tsconfig.json`
- `db/schema/city.sql`
- `db/dictionary/*.md`
- `tests/unit/requestContext.test.ts`
- `tests/security/noBypassArchitecture.test.ts`
- `scripts/preflight-architecture.ps1`
- `vitest.config.ts`

---

## 8. 新增测试清单

| 文件 | 用例数 |
|------|--------|
| `tests/unit/requestContext.test.ts` | 3 |
| `tests/unit/cityResolver.test.ts` | 5 |
| `tests/contract/requestContext.contract.test.ts` | 3 |
| `tests/security/noMissingCityCode.test.ts` | 2 |
| `tests/security/adminScopeLeak.test.ts` | 3 |
| `tests/security/noBypassArchitecture.test.ts` | 3 |

**合计：** 21 passed · 2 todo

---

## 9. 验收命令结果

| 命令 | 结果 |
|------|------|
| `npx pnpm install` | ✅ |
| `npx pnpm build` | ✅ |
| `npx pnpm typecheck` | ✅ |
| `npx pnpm test` | ✅ 21 passed |
| `npx pnpm preflight` | ✅ Phase 0 + Phase 1 |

---

## 10. Backend 验证结果

### GET /health
```json
{"status":"ok","service":"xlb-backend","phase":"1","brand":"喜乐帮 / XLB"}
```

### GET /api/system/status
```json
{"ok":true,"project":"XLB","phase":"1","apps":["customer","worker","admin"],"backend":"ready","foundation":"request-context-city"}
```

### GET /api/debug/context（带 headers）
```json
{"ok":true,"traceId":"...","appType":"customer","role":"customer","cityCode":"hangzhou",...}
```
**HTTP 200**

### GET /api/debug/context（无 headers）
**HTTP 400**

---

## 11. 业务越界检查

| 禁止项 | 状态 |
|--------|------|
| 订单 / 支付 / 派单 / 履约 / 退款 / 账本 / 资质 | ✅ 未实现 |
| JWT 登录 | ✅ 未实现 |
| 真实 DB 查询 | ✅ 未实现 |
| 三端业务页面修改 | ✅ 未修改 |
| SDJ99 代码迁移 | ✅ 无 |

---

## 12. Phase 1-Lock 封版（2026-07-03）

### 12.1 复验命令结果

| 命令 | 结果 |
|------|------|
| `npx pnpm install` | ✅ |
| `npx pnpm build` | ✅ |
| `npx pnpm typecheck` | ✅ |
| `npx pnpm test` | ✅ 21 passed · 2 todo |
| `npx pnpm preflight` | ✅ |

### 12.2 CityCode 最终标准

| 规则 | 值 |
|------|-----|
| 类型 | `string` |
| 最小长度 | **2** |
| 最大长度 | **64** |
| 正则 | `^[a-z0-9_-]+$` |
| 规范化 | trim + lowercase |
| 示例 | `hangzhou` · `shanghai` · `beijing` · `hz_01` |
| 禁止 | 默认全国 |
| 错误码 | 缺失或非法 → **400** |

**封版修正：** `packages/validators/src/cityCodeSchema.ts` 由 `min(1)` 统一为 `min(2)`；文档同步更新。

### 12.3 Docker MySQL Migration 实跑

**容器状态：** `xlb-mysql-local` · `xlb-redis-local` — healthy

**执行脚本：**

```powershell
cmd /c type db\migrations\000_init.sql | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local
cmd /c type db\migrations\001_city_foundation.sql | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local
cmd /c type db\seed\cities.seed.sql | docker exec -i xlb-mysql-local mysql -uxlb -pxlb_local_password xlb_local
```

**结果：** ✅ 全部成功

**SHOW TABLES：**

- `schema_migrations`
- `cities`
- `admin_city_scopes`

**schema_migrations：** `001_city_foundation`

**cities seed：**

| city_code | city_name | is_open |
|-----------|-----------|---------|
| beijing | 北京 | 1 |
| hangzhou | 杭州 | 1 |
| shanghai | 上海 | 1 |

> 注：表字段为 `is_open`（非 `status`）。

### 12.4 封版修改文件

- `packages/validators/src/cityCodeSchema.ts` — min(2)
- `docs/contracts/CONTRACT_CITY_CODE.md`
- `docs/architecture/03_XLB_REQUEST_CONTEXT_CITY_FOUNDATION.md`
- `docs/reports/PHASE1_REQUEST_CONTEXT_CITY_FOUNDATION_REPORT.md`

**未修改：** 业务代码 · compose · migration SQL 结构

### 12.5 业务越界

✅ 无越界

### 12.6 合并 main 条件

✅ 已全部满足

---

## 13. Git 封版标记

- **分支：** `phase1-request-context-city-foundation`
- **Tag：** `xlb-phase1-request-context-city`（合并 main 后打在 merge commit）

---

## 14. Phase 2 开工

- **可进入 Phase 2：** 是（CityConfig + Catalog + Pricing）
- **前提：** Phase 1 已合并 main 并打 tag

---

## 15. 风险（更新）

- Header 鉴权为 skeleton，非 JWT（Phase 1 预期）
- Backend 尚未连接 MySQL（Phase 2 实装 cityConfig 缓存时再接）
- 中文字段在部分终端可能显示乱码，数据库内 UTF-8 存储正常
