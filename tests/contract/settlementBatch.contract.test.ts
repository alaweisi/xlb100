import { describe, expect, it } from "vitest";
import { settlementBatchSchema } from "@xlb/validators";

describe("settlement batch contract", () => {
  it("contains preparation totals and no transfer state", () => {
    const now = new Date().toISOString();
    const value = { settlementBatchId: "stb", cityCode: "hangzhou", currency: "CNY", totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, itemCount: 1, status: "prepared", preparedAt: now, confirmedAt: null, confirmedBy: null, createdAt: now, updatedAt: now };
    expect(settlementBatchSchema.parse(value)).toEqual(value);
  });
});
