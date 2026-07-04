import { describe, expect, it } from "vitest";
import { settlementPayableEventPayloadSchema } from "@xlb/validators";

describe("settlement payable event contract", () => {
  it("contains readiness snapshots but rejects payout or transfer instructions", () => {
    const payload = {
      payableId: "spy",
      batchId: "stb",
      cityCode: "hangzhou",
      currency: "CNY",
      grossAmount: 89,
      platformFeeAmount: 8.9,
      workerReceivableAmount: 80.1,
      itemCount: 1,
      markedAt: new Date().toISOString(),
      markedBy: "operator-1",
    };
    expect(settlementPayableEventPayloadSchema.parse(payload)).toEqual(payload);
    expect(settlementPayableEventPayloadSchema.safeParse({ ...payload, payoutInstruction: {} }).success).toBe(false);
    expect(settlementPayableEventPayloadSchema.safeParse({ ...payload, providerAccount: "account" }).success).toBe(false);
    expect(settlementPayableEventPayloadSchema.safeParse({ ...payload, transferId: "tx" }).success).toBe(false);
    expect(settlementPayableEventPayloadSchema.safeParse({ ...payload, paidAt: new Date().toISOString() }).success).toBe(false);
  });
});
