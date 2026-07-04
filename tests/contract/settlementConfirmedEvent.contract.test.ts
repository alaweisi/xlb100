import { describe, expect, it } from "vitest";
import { settlementConfirmedEventPayloadSchema } from "@xlb/validators";

describe("settlement confirmed event contract", () => {
  it("contains audit and amount snapshots but rejects transfer instructions", () => {
    const payload = { settlementBatchId: "stb", cityCode: "hangzhou", currency: "CNY", itemCount: 1, totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, confirmedAt: new Date().toISOString(), confirmedBy: "operator-1" };
    expect(settlementConfirmedEventPayloadSchema.parse(payload)).toEqual(payload);
    expect(settlementConfirmedEventPayloadSchema.safeParse({ ...payload, payoutInstruction: {} }).success).toBe(false);
    expect(settlementConfirmedEventPayloadSchema.safeParse({ ...payload, providerAccount: "account" }).success).toBe(false);
    expect(settlementConfirmedEventPayloadSchema.safeParse({ ...payload, withdrawTo: "card" }).success).toBe(false);
  });
});
