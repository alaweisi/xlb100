import { describe, expect, it } from "vitest";
import {
  completeFulfillmentSchema,
  fulfillmentSchema,
  startFulfillmentSchema,
} from "@xlb/validators";

describe("fulfillment lifecycle contract", () => {
  it("accepts lifecycle fields and strict text-only commands", () => {
    expect(startFulfillmentSchema.safeParse({}).success).toBe(true);
    expect(startFulfillmentSchema.safeParse({ evidence: "x" }).success).toBe(false);
    expect(completeFulfillmentSchema.safeParse({ completionNote: "done" }).success).toBe(true);
    for (const body of [{ amount: 1 }, { settlement: {} }, { refund: true }, { evidence: [] }]) {
      expect(completeFulfillmentSchema.safeParse(body).success).toBe(false);
    }
    expect(fulfillmentSchema.safeParse({
      fulfillmentId: "ful-1", acceptanceId: "acc-1", dispatchTaskId: "dpt-1", orderId: "ord-1",
      cityCode: "hangzhou", workerId: "worker-1", skuId: "sku_home_daily_2h", status: "completed",
      startedAt: "2026-07-03T01:00:00.000Z", completedAt: "2026-07-03T02:00:00.000Z",
      completionNote: "done", createdAt: "2026-07-03T00:00:00.000Z", updatedAt: "2026-07-03T02:00:00.000Z",
    }).success).toBe(true);
  });
});
