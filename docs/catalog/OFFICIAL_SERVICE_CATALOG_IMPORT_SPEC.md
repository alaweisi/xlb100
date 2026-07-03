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
| 1 | 用户在 `OFFICIAL_SERVICE_CATALOG_SOURCE.md` 粘贴/确认正式清单 |
| 2 | 人工或脚本生成 `007_official_catalog.seed.sql` · `008_official_pricing.seed.sql` |
| 3 | 可选执行 `006_disable_demo_catalog.seed.sql` 禁用 demo 条目 |
| 4 | 运行 `scripts/seed-local.ps1` |
| 5 | 运行 `scripts/check-official-catalog-ready.ps1` — 通过后方可进入 Phase 4 |

## Seed 命名

见 `OFFICIAL_SERVICE_CATALOG_SEED_PLAN.md`。

## 禁止

- Cursor 编造正式 16 大类名称或 SKU
- 无用户确认源文件时生成 `007` / `008` seed
- Phase 4 使用 `demo_cleaning_sku` 作为订单 SKU
