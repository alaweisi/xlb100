# PHASE3_CITYCONFIG_CATALOG_PRICING_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**分支：** `phase3-cityconfig-catalog-pricing-foundation` → 已合并 `main`  
**阶段：** Phase 3 — CityConfig + Catalog + Pricing Foundation  
**封版：** Phase 3-Lock  
**日期：** 2026-07-03  

---

## 1. Phase 3 目标

建立 CityConfig · Catalog · Pricing 模块骨架与城市级配置表。

**本阶段不做：** 订单 · 支付 · 派单 · 履约 · 账本 · 退款 · 资质 · 三端业务页 · Provider

---

## 2. 新增 DB 表

| 表 | 说明 |
|----|------|
| `city_configs` | 城市配置 |
| `service_categories` | 城市服务类目 |
| `service_items` | 城市服务项 |
| `service_skus` | 城市 SKU |
| `price_rules` | 城市价格规则 |

Migration: `004_cityconfig_catalog_pricing_foundation.sql`

---

## 3. Phase 3-Lock 复验命令结果

| 命令 | 结果 |
|------|------|
| install | ✅ |
| build | ✅ |
| typecheck | ✅ |
| test | ✅ 72 passed · 1 todo |
| preflight | ✅ Phase 0–3 |
| migrate-local.ps1 | ✅ |
| seed-local.ps1 | ✅ |
| Docker MySQL / Redis | ✅ healthy |

---

## 4. city_configs 表最终内容

| city_code | is_open | service_enabled | pricing_enabled |
|-----------|---------|-----------------|-----------------|
| beijing | 1 | 1 | 1 |
| hangzhou | 1 | 1 | 1 |
| shanghai | 1 | 1 | 1 |

**确认：** 仅 beijing / hangzhou / shanghai，无 `__global__`。

---

## 5. Catalog demo seed 最终内容

| city_code | category_id | item_id | sku_id |
|-----------|-------------|---------|--------|
| beijing | demo_cleaning_category | demo_cleaning_item | demo_cleaning_sku |
| hangzhou | demo_cleaning_category | demo_cleaning_item | demo_cleaning_sku |
| shanghai | demo_cleaning_category | demo_cleaning_item | demo_cleaning_sku |

**确认：** 仅 demo 类目，**未导入正式 16 大类**。

---

## 6. Pricing demo seed 最终内容

| city_code | sku_id | base_price | currency |
|-----------|--------|------------|----------|
| hangzhou | demo_cleaning_sku | 99.00 | CNY |
| shanghai | demo_cleaning_sku | 109.00 | CNY |
| beijing | demo_cleaning_sku | 119.00 | CNY |

**确认：** 无 `__global__`，无全国 fallback。

---

## 7. __global__ 规则

| 规则 | 状态 |
|------|------|
| 不在 city_configs / catalog / pricing 表 | ✅ |
| 仅 admin_city_scopes + guard + 禁止性 docs/tests | ✅ |
| 业务 cityCode 使用 `__global__` → 400 | ✅ |

全仓搜索：Phase 3 配置表与 demo seed 中无 `__global__`。

---

## 8. backend CityConfig / Catalog / Pricing API 验证

| 端点 | 结果 |
|------|------|
| GET `/health` | ✅ phase 3 |
| GET `/api/system/status` | ✅ cityconfig-catalog-pricing |
| GET `/api/system/db-health` | ✅ mysql ok / redis ok |
| GET `/api/city-config/current` (hangzhou) | ✅ config returned |
| GET `/api/catalog` (hangzhou) | ✅ demo catalog |
| GET `/api/pricing/quote?skuId=demo_cleaning_sku` | ✅ basePrice 99 CNY |
| GET `/api/catalog` 无 cityCode | ✅ 400 |
| GET `/api/catalog` cityCode=`__global__` | ✅ 400 |

---

## 9. 新增测试（Phase 3）

| 类别 | 文件 |
|------|------|
| unit | cityConfig · catalog · pricing |
| integration | cityConfigApi · catalogApi · pricingApi |
| contract | cityConfig · catalog · pricing |
| security | noGlobalCatalog · noGlobalPricing · noCatalogWithoutCity · noPricingWithoutCity |

---

## 10. 业务越界

✅ 无 — 未实现订单/支付/派单/账本/资质/三端业务页/Provider/正式 16 类目

---

## 11. Phase 3-Lock 结论

| 项 | 状态 |
|----|------|
| 仅 demo seed | ✅ |
| 未导入正式 16 类目 | ✅ |
| __global__ 业务拒绝 | ✅ |
| 合并 main 条件 | ✅ |
| Tag | `xlb-phase3-cityconfig-catalog-pricing` |

---

## 12. 正式类目说明

正式 16 大类**必须由用户确认清单后导入**。Phase 3 仅保留 `demo_cleaning_category` / `demo_cleaning_item` / `demo_cleaning_sku`。
