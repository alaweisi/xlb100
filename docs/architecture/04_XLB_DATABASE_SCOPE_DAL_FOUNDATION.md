# 04 — Database Scope + DAL Foundation (Phase 2)

**项目：** 喜乐帮 / XLB  
**阶段：** Phase 2  

## 目标

建立 MySQL / Redis 连接、migration/seed runner、RepositoryBase、ScopedExecutor 与 AdminQueryGuard 真实约束。

## 组件

| 模块 | 路径 |
|------|------|
| MySQL Pool | `backend/src/dal/mysqlPool.ts` |
| Redis Client | `backend/src/dal/redisClient.ts` |
| Migration | `backend/src/dal/migrationRunner.ts` |
| Seed | `backend/src/dal/seedRunner.ts` |
| Repository | `backend/src/dal/repositoryBase.ts` |
| Scope | `backend/src/dal/scopedExecutor.ts` |
| Admin Guard | `backend/src/dal/adminQueryGuard.ts` |
| DB Health | `backend/src/observability/health.ts` |

## 端点

- `GET /api/system/db-health` — 匿名，返回 mysql/redis 状态

## 本阶段不做

CityConfig · Catalog · Pricing · 订单 · 支付 · 派单 · 账本 · 资质 · 退款

## __global__ 规则（Phase 2-Lock）

- `cities` 表仅含真实城市（hangzhou / shanghai / beijing）
- `__global__` 仅存在于 `admin_city_scopes`，表示 global admin 权限
- global admin 仍须显式指定业务 `cityCode`，禁止无 scope 全国查询
