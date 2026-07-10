# CONTRACT_CATALOG.md — 喜乐帮 / XLB

## 定义

Catalog 是**城市服务目录**，不是交易或订单。

## 类型

- `ServiceCategory` — categoryId · cityCode · name · sortOrder · isEnabled
- `ServiceItem` — itemId · categoryId · cityCode · name · sortOrder · isEnabled
- `ServiceSku` — skuId · itemId · cityCode · name · unit · profile · standards · sortOrder · isEnabled
- `ServiceSkuProfile` — serviceMode · brandScope · modelScope · skillLevel · warrantyDays · requiresModel · requiresMeasurement · supportsEnterprise · serviceGuaranteeText
- `ServiceStandard` — standardType · title · content · sortOrder · isRequired · isEnabled

## 规则

1. 所有 Catalog 查询必须带 `cityCode`
2. 禁止 `__global__` 作为业务 cityCode
3. 禁止全国目录 fallback
4. Phase 16 起，所有启用 SKU 应具备服务画像和基础服务标准
5. 服务画像和标准只描述服务商品与履约要求，不执行派单、支付或售后判责

## API

| 方法 | 路径 | 要求 |
|------|------|------|
| GET | `/api/catalog` | x-xlb-app-type · x-xlb-role · x-xlb-city-code |

## Boundary

订单 · 支付 · 派单 · 全国默认 Catalog
