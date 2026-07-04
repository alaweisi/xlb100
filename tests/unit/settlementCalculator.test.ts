import { describe, expect, it } from "vitest";
import { calculateSettlementTotals } from "../../backend/src/settlement/settlementCalculator.js";

describe("settlementCalculator", () => {
  it("sums preparation items with money rounding", () => {
    expect(calculateSettlementTotals([
      { grossAmount: 89, platformFee: 8.9, workerReceivable: 80.1 },
      { grossAmount: 10.05, platformFee: 1.01, workerReceivable: 9.04 },
    ])).toEqual({
      totalGrossAmount: 99.05,
      totalPlatformFee: 9.91,
      totalWorkerReceivable: 89.14,
      itemCount: 2,
      currency: "CNY",
    });
  });
});
