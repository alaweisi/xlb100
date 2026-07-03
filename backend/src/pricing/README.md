# Pricing Module — Phase 3

City-scoped price rules (not payment or orders).

- `pricingRepository` — city + sku scoped price rule lookup
- `GET /api/pricing/quote?skuId=xxx` — read price rule for cityCode + skuId

**Rules:** no nationwide fallback · no payment logic · CNY default
