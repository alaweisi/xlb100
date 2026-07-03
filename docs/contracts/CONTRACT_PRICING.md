# CONTRACT_PRICING.md — 喜乐帮 / XLB

## 定义

Pricing 是**城市价格规则**，不是支付或订单报价。

## 类型

- `PriceRule` — priceRuleId · cityCode · skuId · basePrice · currency · isEnabled · version
- `PriceQuote` — cityCode · skuId · basePrice · currency · priceRuleId · version

## 规则

1. 所有 Pricing 查询必须带 `cityCode` 和 `skuId`
2. `basePrice >= 0`，currency 默认 `CNY`
3. 禁止 `__global__` 作为业务 cityCode
4. 禁止全国价格 fallback
5. 禁止支付逻辑

## API

| 方法 | 路径 | 要求 |
|------|------|------|
| GET | `/api/pricing/quote?skuId=xxx` | x-xlb-app-type · x-xlb-role · x-xlb-city-code |

## Phase 3 不做

订单 · 支付 · 派单 · 账本 · 退款
