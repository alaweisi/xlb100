import { describe, it, expect } from "vitest";
import { DispatchValidationError, DispatchService } from "../../backend/src/dispatch/dispatchService.js";
import type { EventOutbox } from "@xlb/types";

describe("dispatchService", () => {
  const context = {
    traceId: "trace-1",
    appType: "admin" as const,
    role: "operator" as const,
    cityCode: "hangzhou" as const,
    userId: "op-1",
    requestStartedAt: new Date().toISOString(),
    requestId: "req-1",
    correlationId: "corr-1",
  };

  it("rejects non order.created events", async () => {
    const service = new DispatchService();
    const event: EventOutbox = {
      eventId: "evt_1",
      eventType: "payment.paid",
      aggregateType: "payment_order",
      aggregateId: "pay_1",
      cityCode: "hangzhou",
      payload: {},
      status: "pending",
      createdAt: new Date().toISOString(),
      publishedAt: null,
    };

    await expect(service.processOrderCreatedEvent(context, event)).rejects.toThrow(
      DispatchValidationError,
    );
  });
});
