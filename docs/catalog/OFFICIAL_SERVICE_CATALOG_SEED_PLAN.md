# OFFICIAL_SERVICE_CATALOG_SEED_PLAN.md — 正式 Seed 命名约定

## 文件顺序

| 文件 | 用途 | 状态 |
|------|------|------|
| `db/seed/004_catalog_demo.seed.sql` | Phase 3 demo 目录（已存在） | ✅ 仅验证用 |
| `db/seed/005_pricing_demo.seed.sql` | Phase 3 demo 价格（已存在） | ✅ 仅验证用 |
| `db/seed/006_disable_demo_catalog.seed.sql` | 正式导入后禁用 demo 条目 | ⏳ 待正式导入时创建 |
| `db/seed/007_official_catalog.seed.sql` | 正式 category / item / sku | ⏳ 待用户确认后创建 |
| `db/seed/008_official_pricing.seed.sql` | 正式 price_rules | ⏳ 待用户确认后创建 |

## 007 要求

- 幂等：`ON DUPLICATE KEY UPDATE`
- 每条记录含 `city_code`
- 不得含 `__global__`
- 不得仅含 `demo_cleaning_*` 标识

## 008 要求

- 幂等：`ON DUPLICATE KEY UPDATE`
- `currency` 默认 `CNY`，`base_price >= 0`
- 每条规则含 `city_code` + `sku_id`
- 不得含 `__global__`
- 不得仅含 `demo_cleaning_sku`

## Phase 4 守门

进入 Phase 4 前必须：

1. `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md` 已完成用户确认（非占位）
2. `007` · `008` seed 存在且通过 `scripts/check-official-catalog-ready.ps1`
3. 通过 `scripts/check-no-demo-catalog-for-phase4.ps1`
