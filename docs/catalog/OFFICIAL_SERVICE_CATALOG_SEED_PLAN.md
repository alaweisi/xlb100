# OFFICIAL_SERVICE_CATALOG_SEED_PLAN.md — 正式 Seed 命名约定

## 文件顺序

| 文件 | 用途 | 状态 |
|------|------|------|
| `db/seed/004_catalog_demo.seed.sql` | Phase 3 demo 目录 | ✅ 仅验证用（Phase 3A-1 后禁用） |
| `db/seed/005_pricing_demo.seed.sql` | Phase 3 demo 价格 | ✅ 仅验证用（Phase 3A-1 后禁用） |
| `db/seed/006_disable_demo_catalog.seed.sql` | 禁用 demo 条目 | ✅ Phase 3A-1 |
| `db/seed/007_official_catalog.seed.sql` | 正式 category / item / sku | ✅ Phase 3A-1 |
| `db/seed/008_official_pricing.seed.sql` | 正式 price_rules | ✅ Phase 3A-1 |

## 生成方式

由 `scripts/generate-official-catalog-seeds.mjs` 从 `docs/catalog/服务类目完整清单.tsv` 自动生成。

## 007 要求

- 幂等：`ON DUPLICATE KEY UPDATE`
- 每条记录含 `city_code`（hangzhou · shanghai · beijing）
- 16 大类 × 3 城 = 48 category 行
- 404 唯一 item 路径 × 3 城 = 1212 item 行
- 492 SKU × 3 城 = 1476 sku 行
- 不得含 `__global__`
- 不得仅含 `demo_cleaning_*` 标识

## 008 要求

- 幂等：`ON DUPLICATE KEY UPDATE`
- `currency` 默认 `CNY`，`base_price >= 0`
- 492 SKU × 3 城 = **1476** 独立 `price_rules`
- 含 `price_text` · `price_type` · `min_price` · `max_price` · `pricing_note`
- 三城价格值当前相同，但记录独立
- 不得含 `__global__`
- 不得仅含 `demo_cleaning_sku`

## Phase 4 守门

进入 Phase 4 前必须：

1. `docs/catalog/OFFICIAL_SERVICE_CATALOG_SOURCE.md` 已完成用户确认（非占位）
2. `007` · `008` seed 存在且通过 `scripts/check-official-catalog-ready.ps1`
3. 通过 `scripts/check-no-demo-catalog-for-phase4.ps1`
4. `006_disable_demo_catalog.seed.sql` 已执行，demo 条目已禁用
