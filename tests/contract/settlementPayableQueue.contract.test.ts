import { describe, expect, it } from "vitest";
import { enqueueSettlementPayableRequestSchema, settlementPayableQueueResponseSchema } from "@xlb/validators";

describe("settlement payable queue contract", () => {
  it("accepts an empty request and queued response", () => {
    const now = new Date().toISOString();
    expect(enqueueSettlementPayableRequestSchema.parse({})).toEqual({});
    const response = {
      ok: true,
      idempotent: false,
      queue: {
        queueId: "spq",
        cityCode: "hangzhou",
        settlementPayableId: "spy",
        settlementBatchId: "stb",
        currency: "CNY",
        grossAmount: 89,
        platformFeeAmount: 8.9,
        workerReceivableAmount: 80.1,
        itemCount: 1,
        status: "queued",
        enqueuedAt: now,
        enqueuedBy: "operator-1",
        createdAt: now,
        updatedAt: now,
      },
    };
    expect(settlementPayableQueueResponseSchema.parse(response)).toEqual(response);
  });
});
