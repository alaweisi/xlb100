import { describe, expect, it } from "vitest";
import { settlementPayableQueuedEventPayloadSchema } from "@xlb/validators";

describe("settlement payable queued event contract", () => {
  it("contains queue snapshots but rejects payout or payment instructions", () => {
    const payload = {
      queueId: "spq",
      payableId: "spy",
      batchId: "stb",
      cityCode: "hangzhou",
      currency: "CNY",
      grossAmount: 89,
      platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1,
      itemCount: 1,
      enqueuedAt: new Date().toISOString(),
      enqueuedBy: "operator-1",
    };
    expect(settlementPayableQueuedEventPayloadSchema.parse(payload)).toEqual(payload);
    expect(settlementPayableQueuedEventPayloadSchema.safeParse({ ...payload, payoutId: "p1" }).success).toBe(false);
    expect(settlementPayableQueuedEventPayloadSchema.safeParse({ ...payload, provider: "wechat" }).success).toBe(false);
    expect(settlementPayableQueuedEventPayloadSchema.safeParse({ ...payload, paymentInstruction: {} }).success).toBe(false);
    expect(settlementPayableQueuedEventPayloadSchema.safeParse({ ...payload, paidAt: new Date().toISOString() }).success).toBe(false);
  });
});
