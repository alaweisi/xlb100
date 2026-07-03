# PHASE1_REQUEST_CONTEXT_CITY_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**路径：** `E:\xlb100`  
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

- 格式：`^[a-z0-9_-]+$`（小写，1–64 字符）
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

## 12. Commit / Phase 2

- **可 commit：** 是（建议 commit 在 `phase1-request-context-city-foundation` 分支）
- **可合并 main：** 待用户确认
- **可进入 Phase 2：** 是 — CityConfig + Catalog + Pricing 可在 Phase 1 地基上开工

---

## 13. 风险

- Migration 尚未对 Docker MySQL 执行（Phase 1 无真实 DB 连接，符合设计）
- Header 鉴权为 skeleton，非 JWT（Phase 1 预期）
- 端口 3000 若已有旧进程需重启 backend 以加载新代码
