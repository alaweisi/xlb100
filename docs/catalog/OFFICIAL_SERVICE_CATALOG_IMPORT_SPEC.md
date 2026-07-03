# OFFICIAL_SERVICE_CATALOG_IMPORT_SPEC.md — 喜乐帮 / XLB

## 目的

为正式 **16 大类 / item / sku / price** 导入建立规范。本规范不包含正式类目数据本身。

## 强制规则

1. **正式服务类目必须由用户确认** — Cursor / Agent 不得凭空生成 16 大类。
2. **每条 category / item / sku 必须有 `cityCode`**（hangzhou · shanghai · beijing 等城市）。
3. **禁止 `__global__` 作为业务 `cityCode`** — 仅允许在 `admin_city_scopes` 权限标记中使用。
4. **禁止全国 catalog fallback** — 所有目录查询必须带请求上下文 `cityCode`。
5. **禁止全国 pricing fallback** — 所有价格规则必须按 `cityCode + skuId` 查询。
6. **正式导入前**，`demo_cleaning_*` seed 仅用于 Phase 3 地基验证，**不得作为交易基础**。
7. **Phase 4 订单开工前**必须完成正式 SKU / 价格 seed 导入并通过 `scripts/check-official-catalog-ready.ps1`。

## 导入流程

| 步骤 | 动作 |
|------|------|
| 1 | 用户在 `OFFICIAL_SERVICE_CATALOG_SOURCE.md` 确认正式清单（TSV） |
| 2 | 运行 `scripts/generate-official-catalog-seeds.mjs` 生成 `006` / `007` / `008` seed |
| 3 | 执行 migration `005_official_pricing_display_fields.sql` |
| 4 | 执行 `scripts/seed-local.ps1`（含 `006_disable_demo_catalog`） |
| 5 | 运行 `scripts/check-official-catalog-ready.ps1` — 通过后方可进入 Phase 4 |

## 价格展示字段（Phase 3A-1）

`price_rules` 扩展字段：

- `price_text` — 原始价格文本（如 `¥89/2小时`）
- `price_type` — `fixed` · `range` · `from` · `estimate_from` · `onsite_quote`
- `min_price` · `max_price` · `pricing_note`

`base_price` 仅为兼容字段；展示与后续报价优先使用 `price_text` / `price_type`。

## Seed 命名

见 `OFFICIAL_SERVICE_CATALOG_SEED_PLAN.md`。

## 禁止

- Cursor 编造正式 16 大类名称或 SKU
- 无用户确认源文件时生成 `007` / `008` seed
- Phase 4 使用 `demo_cleaning_sku` 作为订单 SKU
