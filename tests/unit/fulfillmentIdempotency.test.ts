import { describe, expect, it, vi } from "vitest";
import type { Fulfillment, RequestContext } from "@xlb/types";
import { FulfillmentService } from "../../backend/src/fulfillment/fulfillmentService.js";

const context: RequestContext = {
  traceId: "trace-idempotency",
  appType: "worker",
  role: "worker",
  cityCode: "hangzhou",
  userId: "worker-1",
  requestStartedAt: "2026-07-03T00:00:00.000Z",
};

function lifecycleFulfillment(status: "in_progress" | "completed"): Fulfillment {
  return {
    fulfillmentId: "ful-1",
    acceptanceId: "acc-1",
    dispatchTaskId: "dpt-1",
    orderId: "ord-1",
    cityCode: "hangzhou",
    workerId: "worker-1",
    skuId: "sku_home_daily_2h",
    status,
    startedAt: "2026-07-03T01:00:00.000Z",
    completedAt: status === "completed" ? "2026-07-03T02:00:00.000Z" : null,
    completionNote: status === "completed" ? "done" : null,
    createdAt: "2026-07-03T00:00:00.000Z",
    updatedAt: "2026-07-03T02:00:00.000Z",
  };
}

describe("fulfillment lifecycle idempotency", () => {
  it.each([
    ["startFulfillment", "in_progress"],
    ["completeFulfillment", "completed"],
  ] as const)("returns idempotent for %s terminal retry", async (method, status) => {
    const insertEvent = vi.fn(async () => undefined);
    const service = new FulfillmentService(
      { findByIdForWorkerForUpdate: vi.fn(async () => lifecycleFulfillment(status)) } as never,
      { insertEvent } as never,
      async (callback) => callback({} as never),
    );

    const result = await service[method](context, "ful-1", {});

    expect(result.idempotent).toBe(true);
    expect(insertEvent).not.toHaveBeenCalled();
  });
});
