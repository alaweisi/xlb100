import { describe, it, expect } from "vitest";
import { buildPaymentMetadata } from "../../backend/src/payment/paymentMetadataBuilder.js";
import type { Order } from "@xlb/types";

const sampleOrder: Order = {
  orderId: "ord_test",
  cityCode: "hangzhou",
  customerId: "customer-demo-001",
  skuId: "sku_home_daily_2h",
  skuName: "2小时日常保洁",
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
};

describe("paymentMetadata", () => {
  it("includes orderId cityCode skuId priceRuleId", () => {
    const metadata = buildPaymentMetadata(sampleOrder);
    expect(metadata.orderId).toBe("ord_test");
    expect(metadata.cityCode).toBe("hangzhou");
    expect(metadata.skuId).toBe("sku_home_daily_2h");
    expect(metadata.priceRuleId).toBe("price_hangzhou_sku_home_daily_2h");
    expect(metadata.customerId).toBe("customer-demo-001");
  });
});
