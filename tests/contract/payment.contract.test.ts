import { describe, it, expect } from "vitest";
import {
  createPaymentOrderSchema,
  mockPaymentWebhookSchema,
  paymentOrderSchema,
} from "@xlb/validators";

describe("payment contract", () => {
  it("createPaymentOrderSchema requires orderId", () => {
    expect(createPaymentOrderSchema.safeParse({}).success).toBe(false);
    expect(createPaymentOrderSchema.safeParse({ orderId: "ord_1" }).success).toBe(true);
  });

  it("mock webhook requires paid status", () => {
    const result = mockPaymentWebhookSchema.safeParse({
      paymentOrderId: "pay_1",
      providerTradeNo: "mock-trade-001",
      status: "paid",
    });
    expect(result.success).toBe(true);
  });

  it("payment amount must be >= 0", () => {
    const result = paymentOrderSchema.safeParse({
      paymentOrderId: "pay_1",
      orderId: "ord_1",
      cityCode: "hangzhou",
      amount: -1,
      currency: "CNY",
      status: "pending",
      provider: "mock",
      providerTradeNo: null,
      metadata: {
        orderId: "ord_1",
        cityCode: "hangzhou",
        skuId: "sku_home_daily_2h",
        priceRuleId: "p1",
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });
});
