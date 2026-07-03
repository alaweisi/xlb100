import { describe, expect, it, vi } from "vitest";
import type { Fulfillment, RequestContext } from "@xlb/types";
import { FulfillmentService } from "../../backend/src/fulfillment/fulfillmentService.js";

const context: RequestContext = {
  traceId: "trace-complete",
  appType: "worker",
  role: "worker",
  cityCode: "hangzhou",
  userId: "worker-1",
  requestStartedAt: "2026-07-03T00:00:00.000Z",
};

const inProgress: Fulfillment = {
  fulfillmentId: "ful-1",
  acceptanceId: "acc-1",
  dispatchTaskId: "dpt-1",
  orderId: "ord-1",
  cityCode: "hangzhou",
  workerId: "worker-1",
  skuId: "sku_home_daily_2h",
  status: "in_progress",
  startedAt: "2026-07-03T01:00:00.000Z",
  completedAt: null,
  completionNote: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T01:00:00.000Z",
};

describe("fulfillmentCompleteService", () => {
  it("completes an in-progress fulfillment with a text note and event", async () => {
    const markCompleted = vi.fn(async () => undefined);
    const insertEvent = vi.fn(async () => undefined);
    const service = new FulfillmentService(
      {
        findByIdForWorkerForUpdate: vi.fn(async () => inProgress),
        markCompleted,
      } as never,
      { insertEvent } as never,
      async (callback) => callback({} as never),
      () => new Date("2026-07-03T02:00:00.000Z"),
    );

    const result = await service.completeFulfillment(context, "ful-1", {
      completionNote: "服务已完成",
    });

    expect(result.idempotent).toBe(false);
    expect(result.fulfillment).toMatchObject({
      status: "completed",
      completedAt: "2026-07-03T02:00:00.000Z",
      completionNote: "服务已完成",
    });
    expect(markCompleted).toHaveBeenCalledOnce();
    expect(insertEvent.mock.calls[0]?.[1]).toMatchObject({
      eventType: "fulfillment.completed",
      aggregateId: "ful-1",
    });
  });
});
