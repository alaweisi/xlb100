import { describe, expect, it } from "vitest";
import { markSettlementPayableRequestSchema, settlementPayableResponseSchema } from "@xlb/validators";

describe("settlement payable readiness contract", () => {
  it("accepts an empty request and payable readiness response", () => {
    const now = new Date().toISOString();
    expect(markSettlementPayableRequestSchema.parse({})).toEqual({});
    const response = {
      ok: true,
      idempotent: false,
      payable: {
        settlementPayableId: "spy",
        cityCode: "hangzhou",
        settlementBatchId: "stb",
        currency: "CNY",
        grossAmount: 89,
        platformFeeAmount: 8.9,
        workerReceivableAmount: 80.1,
        itemCount: 1,
        status: "payable",
        markedAt: now,
        markedBy: "operator-1",
        createdAt: now,
        updatedAt: now,
      },
    };
    expect(settlementPayableResponseSchema.parse(response)).toEqual(response);
  });
});
