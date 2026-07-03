import { describe, expect, it, vi } from "vitest";
import type { Fulfillment, RequestContext } from "@xlb/types";
import { FulfillmentService } from "../../backend/src/fulfillment/fulfillmentService.js";

const context: RequestContext = {
  traceId: "trace-start",
  appType: "worker",
  role: "worker",
  cityCode: "hangzhou",
  userId: "worker-1",
  requestStartedAt: "2026-07-03T00:00:00.000Z",
};

const accepted: Fulfillment = {
  fulfillmentId: "ful-1",
  acceptanceId: "acc-1",
  dispatchTaskId: "dpt-1",
  orderId: "ord-1",
  cityCode: "hangzhou",
  workerId: "worker-1",
  skuId: "sku_home_daily_2h",
  status: "accepted",
  startedAt: null,
  completedAt: null,
  completionNote: null,
  createdAt: "2026-07-03T00:00:00.000Z",
  updatedAt: "2026-07-03T00:00:00.000Z",
};

describe("fulfillmentStartService", () => {
  it("starts an accepted fulfillment and writes its outbox event", async () => {
    const markStarted = vi.fn(async () => undefined);
    const insertEvent = vi.fn(async () => undefined);
    const service = new FulfillmentService(
      {
        findByIdForWorkerForUpdate: vi.fn(async () => accepted),
        markStarted,
      } as never,
      { insertEvent } as never,
      async (callback) => callback({} as never),
      () => new Date("2026-07-03T01:00:00.000Z"),
    );

    const result = await service.startFulfillment(context, "ful-1", {});

    expect(result.idempotent).toBe(false);
    expect(result.fulfillment.status).toBe("in_progress");
    expect(result.fulfillment.startedAt).toBe("2026-07-03T01:00:00.000Z");
    expect(markStarted).toHaveBeenCalledOnce();
    expect(insertEvent.mock.calls[0]?.[1]).toMatchObject({
      eventType: "fulfillment.started",
      aggregateId: "ful-1",
      cityCode: "hangzhou",
    });
  });
});
