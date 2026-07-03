import { describe, it, expect } from "vitest";
import { createOrderSchema, orderSchema } from "@xlb/validators";

describe("order contract", () => {
  it("createOrderSchema requires skuId quantity customerId", () => {
    const missing = createOrderSchema.safeParse({ skuId: "sku_home_daily_2h" });
    expect(missing.success).toBe(false);

    const valid = createOrderSchema.safeParse({
      customerId: "customer-demo-001",
      skuId: "sku_home_daily_2h",
      quantity: 1,
    });
    expect(valid.success).toBe(true);
  });

  it("orderSchema requires cityCode and price snapshot fields", () => {
    const result = orderSchema.safeParse({
      orderId: "ord_1",
      customerId: "c1",
      skuId: "sku_home_daily_2h",
      skuName: "2h",
      quantity: 1,
      unit: "次",
      priceRuleId: "price_hangzhou_sku_home_daily_2h",
      priceText: "¥89/2小时",
      priceType: "fixed",
      basePrice: 89,
      currency: "CNY",
      totalAmount: 89,
      status: "pending_payment",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
