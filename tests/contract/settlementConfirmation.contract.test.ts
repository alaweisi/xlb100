import { describe, expect, it } from "vitest";
import { confirmSettlementBatchRequestSchema, settlementConfirmationResponseSchema } from "@xlb/validators";

describe("settlement confirmation contract", () => {
  it("accepts an empty request and confirmed audit response", () => {
    const now = new Date().toISOString();
    expect(confirmSettlementBatchRequestSchema.parse({})).toEqual({});
    const response = { ok: true, idempotent: false, batch: { settlementBatchId: "stb", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "confirmed", preparedAt: now, confirmedAt: now, confirmedBy: "operator-1", createdAt: now, updatedAt: now } };
    expect(settlementConfirmationResponseSchema.parse(response)).toEqual(response);
  });
});
