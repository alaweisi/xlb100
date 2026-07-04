import { describe, expect, it } from "vitest";
import { settlementItemSchema } from "@xlb/validators";

describe("settlement item contract", () => {
  it("requires its ledger accrual identity", () => {
    const now = new Date().toISOString();
    const value = { settlementItemId: "sti", settlementBatchId: "stb", cityCode: "hangzhou", accrualId: "lar", fulfillmentId: "ful", orderId: "ord", paymentOrderId: "pay", workerId: "worker", customerId: "customer", skuId: "sku", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY", status: "prepared", createdAt: now, updatedAt: now };
    expect(settlementItemSchema.parse(value)).toEqual(value);
    const { accrualId: _omitted, ...withoutAccrual } = value;
    expect(settlementItemSchema.safeParse(withoutAccrual).success).toBe(false);
  });
});
