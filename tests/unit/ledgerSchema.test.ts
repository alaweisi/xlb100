import { describe, expect, it } from "vitest";
import { ledgerAccrualSchema } from "@xlb/validators";

const valid = {
  accrualId: "lac-1", cityCode: "hangzhou", fulfillmentId: "ful-1", orderId: "ord-1",
  paymentOrderId: "pay-1", workerId: "worker-1", customerId: "customer-1", skuId: "sku-1",
  grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY",
  sourceEventId: "evt-1", status: "accrued", createdAt: new Date().toISOString(),
};

describe("ledgerSchema", () => {
  it("accepts the Phase 8A contract and rejects forbidden fields", () => {
    expect(ledgerAccrualSchema.safeParse(valid).success).toBe(true);
    expect(ledgerAccrualSchema.safeParse({ ...valid, cityCode: "__global__" }).success).toBe(false);
    expect(ledgerAccrualSchema.safeParse({ ...valid, grossAmount: -1 }).success).toBe(false);
    expect(ledgerAccrualSchema.safeParse({ ...valid, settlementStatus: "ready" }).success).toBe(false);
    expect(ledgerAccrualSchema.safeParse({ ...valid, payoutStatus: "paid" }).success).toBe(false);
    expect(ledgerAccrualSchema.safeParse({ ...valid, refundStatus: "none" }).success).toBe(false);
  });
});
