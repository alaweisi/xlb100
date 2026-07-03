import { describe, it, expect } from "vitest";
import { workerAcceptResponseSchema } from "@xlb/validators";

describe("workerAccept contract", () => {
  it("validates accept response", () => {
    const result = workerAcceptResponseSchema.safeParse({
      ok: true,
      idempotent: false,
      acceptance: {
        acceptanceId: "acc_1",
        dispatchTaskId: "dpt_1",
        cityCode: "hangzhou",
        orderId: "ord_1",
        workerId: "worker-demo-hangzhou",
        skuId: "sku_home_daily_2h",
        status: "accepted",
        acceptedAt: "2026-01-01T00:00:00.000Z",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      fulfillment: {
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
      },
    });
    expect(result.success).toBe(true);
  });
});
