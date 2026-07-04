import { describe, expect, it } from "vitest";
import { generateSettlementBatchId, generateSettlementItemId } from "../../backend/src/settlement/settlementIds.js";

describe("settlementIds", () => {
  it("generates distinct typed identifiers", () => {
    const batch = generateSettlementBatchId();
    const item = generateSettlementItemId();
    expect(batch).toMatch(/^stb_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(item).toMatch(/^sti_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(batch).not.toBe(item);
  });
});
