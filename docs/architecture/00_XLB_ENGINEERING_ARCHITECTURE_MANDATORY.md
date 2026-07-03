# 喜乐帮 / XLB — 强制工程架构

## 项目品牌

- 中文名：**喜乐帮**
- 代号：**XLB**
- 包名前缀：**@xlb/***

## 禁止项

- 禁止使用 `@sdj99` 作为新包名
- 禁止使用 `sdj99` 作为新项目根命名
- 禁止迁移旧 SDJ99 半成品代码

## Phase 0 约束

- 禁止实现业务逻辑（订单、支付、派单、账本、认证、退款等）
- 禁止实现登录 / JWT / city_code 路由 / ScopedExecutor
- 禁止创造未批准的一级目录
- 禁止在三端 apps 内复制 `@xlb/types` 类型
- 三端未来必须通过 `@xlb/api-client` 访问后端

## 模块规则

- 类型契约：`packages/types` + `packages/validators`
- 业务模块：必须进入 `backend/src/` 对应目录
- 未来业务：RequestContext → CityCode → Contract → Guard
- CI 守门失败 = 不得合并

## 三端

| App | 目录 | 说明 |
|-----|------|------|
| C 端 | apps/customer | 用户下单 |
| W 端 | apps/worker | 师傅履约 |
| A 端 | apps/admin | 运营管理 |
