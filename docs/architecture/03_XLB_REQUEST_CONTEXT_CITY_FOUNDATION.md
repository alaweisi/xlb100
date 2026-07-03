# 03 — RequestContext + City Foundation (Phase 1)

**项目：** 喜乐帮 / XLB  
**阶段：** Phase 1  

## 目标

建立请求上下文与城市路由地基，为后续业务模块提供统一入口。

## 组件

| 模块 | 路径 | 职责 |
|------|------|------|
| RequestContext | `backend/src/context/` | traceId、headers 解析、middleware |
| City | `backend/src/city/` | canonicalizer、resolver、router、scope |
| Gateway | `backend/src/gateway/` | appTypeGuard、authz 骨架 |
| DAL | `backend/src/dal/` | scopedExecutor、adminQueryGuard 骨架 |

## 不可旁路规则

1. 城市 scoped 路由必须带 `x-xlb-city-code`
2. Admin 查询必须经过 `adminQueryGuard`
3. 数据访问必须经过 `scopedExecutor`（Phase 2+ 实装 DB）

## CityCode 规则（Phase 1 标准）

- 类型：`string`
- 长度：2–64
- 格式：`^[a-z0-9_-]+$`
- 规范化：trim + lowercase
- 示例：`hangzhou`、`shanghai`、`beijing`、`hz_01`
- 禁止默认全国；缺失或非法 → 400

## 本阶段不做

订单、支付、派单、JWT 登录、真实 DB 查询
