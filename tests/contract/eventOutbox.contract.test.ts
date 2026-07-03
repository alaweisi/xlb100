import { describe, it, expect } from "vitest";
import { eventOutboxSchema, outboxEventTypeSchema } from "@xlb/validators";

describe("eventOutbox contract", () => {
  it("supports order.created order.paid payment.paid", () => {
    for (const eventType of ["order.created", "order.paid", "payment.paid"]) {
      expect(outboxEventTypeSchema.safeParse(eventType).success).toBe(true);
    }
  });

  it("payload must be serializable record", () => {
    const result = eventOutboxSchema.safeParse({
      eventId: "evt_1",
      eventType: "order.created",
      aggregateType: "order",
      aggregateId: "ord_1",
      cityCode: "hangzhou",
      payload: { orderId: "ord_1", totalAmount: 89 },
      status: "pending",
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
    expect(result.success).toBe(true);
  });
});
