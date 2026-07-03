# PHASE3A_OFFICIAL_SERVICE_CATALOG_SEED_IMPORT_REPORT

> Phase 3A-1 — Official Service Catalog Seed Import  
> Branch: `phase3a-official-service-catalog-seed-import`  
> Date: 2026-07-03

## 1. TSV 源文件路径

`docs/catalog/服务类目完整清单.tsv`（用户确认源：`e:\sdj9999\服务类目完整清单.tsv`）

## 2. TSV 校验结果

| 项 | 结果 |
|----|------|
| SKU 行数 | 492 ✅ |
| 一级大类 | 16 ✅ |
| SKU 编码重复 | 无 ✅ |
| 必填字段 | 无空值 ✅ |
| item 三段结构 L2>L3>L4 | 全部通过 ✅ |
| SKU 编码正则 `^sku_[a-z0-9_]+$` | 全部通过 ✅ |
| `__global__` | 未出现 ✅ |
| `demo_cleaning_*` | 未出现 ✅ |

## 3. 16 个一级大类

1. 家庭保洁
2. 家电清洗
3. 家电维修
4. 上门安装
5. 管道疏通
6. 开锁换锁
7. 水电维修
8. 防水补漏/精准测漏
9. 家具家居维修保养
10. 房屋修缮/局部改造
11. 搬家搬运/拆旧清运
12. 甲醛检测治理
13. 数码办公维修
14. 洗衣洗鞋
15. 保姆月嫂/照护
16. 四害消杀

## 4. SKU 总数

492（TSV 源）；落库 `service_skus` 总计 **1476**（492 × 3 城）

## 5. 三城统一价格策略

hangzhou / shanghai / beijing 当前均使用 TSV 同一套价格文本与数值。

## 6. 三城独立 price_rules 策略

每个 SKU 生成三条独立记录：

- `price_hangzhou_<sku_id>`
- `price_shanghai_<sku_id>`
- `price_beijing_<sku_id>`

不使用全国 fallback，不使用 `__global__`。

## 7. demo catalog 禁用结果

`006_disable_demo_catalog.seed.sql` 将以下条目 `is_enabled = 0`（保留审计）：

- `demo_cleaning_category`
- `demo_cleaning_item`
- `demo_cleaning_sku`
- demo `price_rules`

## 8. official catalog seed

- 路径：`db/seed/007_official_catalog.seed.sql`
- 统计：48 categories · 1212 items · 1476 skus

## 9. official pricing seed

- 路径：`db/seed/008_official_pricing.seed.sql`
- 统计：1476 price_rules
- migration：`db/migrations/005_official_pricing_display_fields.sql`（`price_text` / `price_type` / `min_price` / `max_price` / `pricing_note`；`service_items.item_path`）

## 10. official catalog API 验证

`GET /api/catalog`（hangzhou）：

- 返回 **16** 个一级大类 ✅
- 不返回 `demo_cleaning_category` ✅
- `cityCode=__global__` → **400** ✅

## 11. official pricing API 验证

`GET /api/pricing/quote?skuId=sku_home_daily_2h`（hangzhou）：

```json
{
  "cityCode": "hangzhou",
  "skuId": "sku_home_daily_2h",
  "basePrice": 89,
  "currency": "CNY",
  "priceText": "¥89/2小时",
  "priceType": "fixed",
  "minPrice": 89,
  "maxPrice": 89,
  "priceRuleId": "price_hangzhou_sku_home_daily_2h",
  "version": 1
}
```

缺 `cityCode` → **400** ✅；`__global__` → **400** ✅

## 12. 守门脚本

| 脚本 | 结果 |
|------|------|
| `check-official-catalog-ready.ps1` | ✅ passed |
| `check-no-demo-catalog-for-phase4.ps1` | ✅ passed |

## 13. `__global__` 业务 cityCode

正式 catalog / pricing seed 与 API 均**不存在** `__global__` 业务 cityCode。

## 14. 是否可以进入 Phase 3A-1-Lock

**已完成** — 见下方 Phase 3A-1-Lock 复验节。

## 15. 是否仍未进入 Phase 4

**是** — 本阶段仅导入 catalog / pricing seed，未做订单、支付、派单、履约、账本、退款、资质审核或三端业务页面修改。

---

## Phase 3A-1-Lock 复验（2026-07-03）

> Lock 分支：`phase3a-official-service-catalog-seed-import` @ `3e76598`  
> Tag（合并后）：`xlb-phase3a-official-catalog-seeds`

### 工程命令

| 命令 | 结果 |
|------|------|
| `npx pnpm build` | ✅ passed |
| `npx pnpm typecheck` | ✅ passed |
| `npx pnpm test` | ✅ **101 passed** \| 1 todo |
| `npx pnpm preflight` | ✅ passed（含 Phase 3A-1） |

### Docker 状态

| 服务 | 状态 |
|------|------|
| `xlb-mysql-local` | ✅ healthy |
| `xlb-redis-local` | ✅ healthy |

### migration / seed

| 脚本 | 结果 |
|------|------|
| `scripts/migrate-local.ps1` | ✅ passed（000–005 均已应用） |
| `scripts/seed-local.ps1` | ✅ passed（001–008 全部执行） |

### 数据库核心数量（enabled，排除 demo）

| 表 | beijing | hangzhou | shanghai |
|----|---------|----------|----------|
| `service_categories` | 16 | 16 | 16 |
| `service_items` | 404 | 404 | 404 |
| `service_skus` | 492 | 492 | 492 |
| `price_rules` | 492 | 492 | 492 |

### demo catalog 禁用

`demo_cleaning_category` 三城均存在且 `is_enabled = 0` ✅

### `__global__` 业务表检查

`service_categories` / `service_items` / `service_skus` / `price_rules` 中 `city_code='__global__'` 计数均为 **0** ✅

### 中文 price_text

DB（utf8mb4）：`sku_home_daily_2h` @ hangzhou → `price_text = ¥89/2小时`，`price_type = fixed`，`base_price = 89` ✅  
API 返回同样正确；部分 Windows 终端可能显示乱码，不影响 DB 与 API。

### Catalog API（Lock 复验）

- hangzhou → **16** 大类，`cityCode = hangzhou`，无 `demo_cleaning_category` ✅
- 缺 cityCode → **400** ✅
- `__global__` → **400** ✅

### Pricing API（Lock 复验）

- `sku_home_daily_2h` @ hangzhou → `priceText = ¥89/2小时`，`priceType = fixed`，`basePrice = 89` ✅
- 缺 cityCode → **400** ✅

### Phase 4 守门脚本

| 脚本 | 结果 |
|------|------|
| `check-official-catalog-ready.ps1` | ✅ passed |
| `check-no-demo-catalog-for-phase4.ps1` | ✅ passed |

### 业务越界

**无** — 未进入 Phase 4（订单 / 支付 / 派单 / 履约 / 账本 / 退款 / 资质 / 三端页面均未改动）。

### 合并 main 条件

**具备** — 全部复验通过后 merge `main` 并打 tag `xlb-phase3a-official-catalog-seeds`。

### Phase 4 就绪说明

正式 catalog / pricing seed 已导入且守门脚本通过；**技术上已解除 Phase 4 的 catalog 阻塞**，但本次 Lock **未启动 Phase 4 业务开发**。

## 生成与验收命令

```bash
node scripts/generate-official-catalog-seeds.mjs
npx pnpm install && npx pnpm build && npx pnpm typecheck && npx pnpm test && npx pnpm preflight
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/migrate-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/seed-local.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-official-catalog-ready.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-no-demo-catalog-for-phase4.ps1
```

## 备注

- `scripts/seed-local.ps1` / `scripts/migrate-local.ps1` 已改为 `docker cp` + `source`，确保 UTF-8 中文价格文本正确落库。
- 生成脚本：`scripts/generate-official-catalog-seeds.mjs`
