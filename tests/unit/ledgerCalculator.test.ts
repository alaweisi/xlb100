import { describe, expect, it } from "vitest";
import { calculateLedgerAccrual } from "../../backend/src/ledger/ledgerCalculator.js";

describe("ledgerCalculator", () => {
  it("accrues 10% platform fee and 90% worker receivable", () => {
    expect(calculateLedgerAccrual(89)).toEqual({
      grossAmount: 89,
      platformFee: 8.9,
      workerReceivable: 80.1,
      currency: "CNY",
    });
    expect(calculateLedgerAccrual(10.05)).toMatchObject({ platformFee: 1.01, workerReceivable: 9.04 });
  });
});
