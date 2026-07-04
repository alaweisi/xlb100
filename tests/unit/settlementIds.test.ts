import { describe, expect, it } from "vitest";
import { generateSettlementBatchId, generateSettlementItemId, generateSettlementPayableId, generateSettlementPayableQueueId } from "../../backend/src/settlement/settlementIds.js";

describe("settlementIds", () => {
  it("generates distinct typed identifiers", () => {
    const batch = generateSettlementBatchId();
    const item = generateSettlementItemId();
    const payable = generateSettlementPayableId();
    const queue = generateSettlementPayableQueueId();
    expect(batch).toMatch(/^stb_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(item).toMatch(/^sti_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(payable).toMatch(/^spy_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(queue).toMatch(/^spq_[a-z0-9]+_[a-f0-9]{8}$/);
    expect(new Set([batch, item, payable, queue]).size).toBe(4);
  });
});
