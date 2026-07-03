import { describe, it, expect } from "vitest";
import { fulfillmentSchema } from "@xlb/validators";

describe("fulfillmentSkeleton contract", () => {
  it("validates accepted skeleton without started/completed", () => {
    const result = fulfillmentSchema.safeParse({
      fulfillmentId: "ful_1",
      acceptanceId: "acc_1",
      dispatchTaskId: "dpt_1",
      orderId: "ord_1",
      cityCode: "hangzhou",
      workerId: "worker-demo-hangzhou",
      skuId: "sku_home_daily_2h",
      status: "accepted",
      startedAt: null,
      completedAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });
});
