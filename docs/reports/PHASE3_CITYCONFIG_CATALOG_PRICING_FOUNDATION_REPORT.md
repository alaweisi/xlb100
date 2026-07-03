# PHASE3_CITYCONFIG_CATALOG_PRICING_FOUNDATION_REPORT

**项目：** 喜乐帮 / XLB  
**分支：** `phase3-cityconfig-catalog-pricing-foundation`  
**阶段：** Phase 3 — CityConfig + Catalog + Pricing Foundation  
**日期：** 2026-07-03  

---

## 1. Phase 3 目标

建立 CityConfig · Catalog · Pricing 模块骨架与城市级配置表。

**本阶段不做：** 订单 · 支付 · 派单 · 履约 · 账本 · 退款 · 资质 · 三端业务页

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

## 3. Seed 内容

| 文件 | 内容 |
|------|------|
| `003_cityconfig.seed.sql` | hangzhou · shanghai · beijing 配置 |
| `004_catalog_demo.seed.sql` | demo_cleaning_category/item/sku（三城，ASCII demo） |
| `005_pricing_demo.seed.sql` | demo_cleaning_sku CNY 99/109/119 |

**未创建正式 16 大类** — 待用户确认清单后导入。

---

## 4. API 验证结果

| 端点 | 结果 |
|------|------|
| GET `/api/city-config/current` | ✅ hangzhou config |
| GET `/api/catalog` | ✅ demo catalog city-scoped |
| GET `/api/pricing/quote?skuId=demo_cleaning_sku` | ✅ basePrice 99 CNY |
| GET `/api/catalog` 无 cityCode | ✅ 400 |

---

## 5. __global__ 规则

- **未使用** `__global__` 作为业务 cityCode
- Catalog / Pricing / CityConfig 均经 `cityCodeSchema` 拒绝 `__global__`
- security 测试覆盖

---

## 6. 验收命令

| 命令 | 结果 |
|------|------|
| install | ✅ |
| build | ✅ |
| typecheck | ✅ |
| test | ✅ 72 passed · 1 todo |
| preflight | ✅ Phase 0–3 |
| migrate-local | ✅ |
| seed-local | ✅ |
| Docker MySQL / Redis | ✅ healthy |

---

## 7. 新增测试

| 类别 | 文件数 | 用例 |
|------|--------|------|
| unit | 3 | cityConfig · catalog · pricing |
| integration | 3 | cityConfigApi · catalogApi · pricingApi |
| contract | 3 | cityConfig · catalog · pricing |
| security | 4 | noGlobalCatalog · noGlobalPricing · noCatalogWithoutCity · noPricingWithoutCity |

---

## 8. 业务越界

✅ 无 — 未实现订单/支付/派单/账本/资质/三端业务页

---

## 9. Phase 3-Lock

- **可 commit：** 是
- **可进入 Phase 3-Lock：** 是（待用户确认）
- **未合并 main**
