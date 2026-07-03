# CONTRACT_CATALOG.md — 喜乐帮 / XLB

## 定义

Catalog 是**城市服务目录**，不是交易或订单。

## 类型

- `ServiceCategory` — categoryId · cityCode · name · sortOrder · isEnabled
- `ServiceItem` — itemId · categoryId · cityCode · name · sortOrder · isEnabled
- `ServiceSku` — skuId · itemId · cityCode · name · unit · sortOrder · isEnabled

## 规则

1. 所有 Catalog 查询必须带 `cityCode`
2. 禁止 `__global__` 作为业务 cityCode
3. 禁止全国目录 fallback
4. 正式 16 大类须用户确认后导入；Phase 3 仅 demo seed

## API

| 方法 | 路径 | 要求 |
|------|------|------|
| GET | `/api/catalog` | x-xlb-app-type · x-xlb-role · x-xlb-city-code |

## Phase 3 不做

订单 · 支付 · 派单 · 全国默认 Catalog
