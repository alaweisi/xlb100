# CONTRACT_PRICING.md — 喜乐帮 / XLB

## 定义

Pricing 是**城市价格规则和透明报价明细**，不是支付执行。

## 类型

- `PriceRule` — priceRuleId · cityCode · skuId · basePrice · currency · priceText · priceType · minPrice · maxPrice · pricingNote · isEnabled · version
- `PriceFeeItem` — feeItemId · priceRuleId · skuId · feeCode · feeName · feeType · chargeMethod · amount · minAmount · maxAmount · unit · isOptional · isEnabled · sortOrder
- `PriceQuoteBreakdown` — baseAmount · requiredFeeAmount · optionalFeeAmount · totalAmount · feeItems
- `PriceQuote` — cityCode · skuId · basePrice · currency · priceText · priceType · priceRuleId · version · skuProfile · standards · breakdown

## 规则

1. 所有 Pricing 查询必须带 `cityCode` 和 `skuId`
2. `basePrice >= 0`，currency 默认 `CNY`
3. 禁止 `__global__` 作为业务 cityCode
4. 禁止全国价格 fallback
5. 禁止支付逻辑
6. Phase 16 起，报价必须返回 `breakdown`，并保留旧字段兼容旧前端
7. `onsite_quote` 费用项可以展示为现场报价占位，但不得伪造真实地图、材料或支付 provider 结果

## API

| 方法 | 路径 | 要求 |
|------|------|------|
| GET | `/api/pricing/quote?skuId=xxx` | x-xlb-app-type · x-xlb-role · x-xlb-city-code |

## Boundary

支付执行 · 派单执行 · 账本 · 退款
