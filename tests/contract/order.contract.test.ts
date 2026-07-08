import { describe, it, expect } from "vitest";
import { createOrderSchema, orderSchema } from "@xlb/validators";

const serviceAddressSchedule = {
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "喜乐帮演示小区 3 栋 502",
  contactName: "演示用户",
  contactPhone: "13800000001",
  scheduledAt: "2026-07-09T09:00:00.000Z",
  scheduledTimeSlot: "morning" as const,
};

describe("order contract", () => {
  it("createOrderSchema requires skuId quantity address contact and schedule", () => {
    const missing = createOrderSchema.safeParse({ skuId: "sku_home_daily_2h" });
    expect(missing.success).toBe(false);

    const valid = createOrderSchema.safeParse({
      customerId: "customer-demo-001",
      skuId: "sku_home_daily_2h",
      quantity: 1,
      ...serviceAddressSchedule,
    });
    expect(valid.success).toBe(true);
  });

  it("orderSchema requires cityCode and price snapshot fields", () => {
    const result = orderSchema.safeParse({
      orderId: "ord_1",
      customerId: "c1",
      ...serviceAddressSchedule,
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
      status: "pending_dispatch",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
