import { describe, expect, it } from "vitest";
import { ledgerAccrualSchema } from "@xlb/validators";

describe("ledger accrual contract", () => {
  it("requires source event and strict CNY accrual fields", () => {
    const value = { accrualId: "lac", cityCode: "hangzhou", fulfillmentId: "ful", orderId: "ord", paymentOrderId: "pay", workerId: "worker", customerId: "customer", skuId: "sku", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY", sourceEventId: "evt", status: "accrued", createdAt: new Date().toISOString() };
    expect(ledgerAccrualSchema.parse(value)).toEqual(value);
    const { sourceEventId: _omitted, ...withoutSource } = value;
    expect(ledgerAccrualSchema.safeParse(withoutSource).success).toBe(false);
  });
});
