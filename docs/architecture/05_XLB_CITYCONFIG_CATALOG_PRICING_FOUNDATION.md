# 05 — CityConfig + Catalog + Pricing Foundation (Phase 3)

**项目：** 喜乐帮 / XLB  
**阶段：** Phase 3  

## 目标

建立城市配置、服务目录、价格规则的地基。不是交易业务。

## 模块

| 模块 | 路径 | 职责 |
|------|------|------|
| CityConfig | `backend/src/cityConfig/` | 城市配置快照 |
| Catalog | `backend/src/catalog/` | 城市服务目录 |
| Pricing | `backend/src/pricing/` | 城市价格规则 |

## DB 表（004 migration）

- `city_configs` · `service_categories` · `service_items` · `service_skus` · `price_rules`
- 所有表必须含 `city_code`

## 端点

- `GET /api/city-config/current`
- `GET /api/catalog`
- `GET /api/pricing/quote?skuId=xxx`

## 强制规则

- 所有查询经 `RequestContext.cityCode` + `ScopedExecutor`
- admin 写配置经 `AdminQueryGuard`
- 禁止 `__global__` 业务 cityCode
- 禁止全国 Catalog / Pricing fallback
- demo seed 仅 `demo_cleaning_*`；正式类目待用户导入

## 本阶段不做

订单 · 支付 · 派单 · 履约 · 账本 · 退款 · 资质 · 三端业务页
