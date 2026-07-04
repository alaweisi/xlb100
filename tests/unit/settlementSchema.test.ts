import { describe, expect, it } from "vitest";
import { settlementBatchSchema, settlementItemSchema } from "@xlb/validators";

const timestamp = new Date().toISOString();
const batch = { settlementBatchId: "stb-1", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "prepared", preparedAt: timestamp, confirmedAt: null, confirmedBy: null, createdAt: timestamp, updatedAt: timestamp };
const item = { settlementItemId: "sti-1", settlementBatchId: "stb-1", cityCode: "hangzhou", accrualId: "lar-1", fulfillmentId: "ful-1", orderId: "ord-1", paymentOrderId: "pay-1", workerId: "worker-1", customerId: "customer-1", skuId: "sku-1", grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1, currency: "CNY", status: "prepared", createdAt: timestamp, updatedAt: timestamp };

describe("settlementSchema", () => {
  it("accepts strict preparation contracts", () => {
    expect(settlementBatchSchema.parse(batch)).toEqual(batch);
    expect(settlementItemSchema.parse(item)).toEqual(item);
  });
  it("rejects global, negative, paid, and provider fields", () => {
    expect(settlementBatchSchema.safeParse({ ...batch, cityCode: "__global__" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ ...item, grossAmount: -1 }).success).toBe(false);
    expect(settlementBatchSchema.safeParse({ ...batch, status: "paid" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ ...item, payoutStatus: "pending" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ ...item, refundStatus: "none" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ ...item, providerTradeNo: "trade" }).success).toBe(false);
    expect(settlementItemSchema.safeParse({ ...item, transferNo: "transfer" }).success).toBe(false);
  });
  it("requires confirmation audit fields exactly for confirmed batches", () => {
    expect(settlementBatchSchema.safeParse({ ...batch, status: "confirmed", confirmedAt: timestamp, confirmedBy: "operator-1" }).success).toBe(true);
    expect(settlementBatchSchema.safeParse({ ...batch, status: "confirmed" }).success).toBe(false);
    expect(settlementBatchSchema.safeParse({ ...batch, confirmedAt: timestamp, confirmedBy: "operator-1" }).success).toBe(false);
  });
});
