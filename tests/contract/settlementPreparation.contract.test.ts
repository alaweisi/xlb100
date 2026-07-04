import { describe, expect, it } from "vitest";
import type { OutboxEventType, SettlementPreparedEventPayload } from "@xlb/types";

describe("settlement preparation contract", () => {
  it("exposes only the prepared event payload", () => {
    const eventType: OutboxEventType = "settlement.prepared";
    const payload: SettlementPreparedEventPayload = { settlementBatchId: "stb", cityCode: "hangzhou", currency: "CNY", itemCount: 1, totalGrossAmount: 89, totalPlatformFee: 8.9, totalWorkerReceivable: 80.1, preparedAt: new Date().toISOString() };
    expect(eventType).toBe("settlement.prepared");
    expect(payload).toMatchObject({ itemCount: 1, currency: "CNY" });
  });
});
