import { describe, it, expect } from "vitest";
import { eventOutboxSchema, orderPaidEventPayloadSchema } from "@xlb/validators";

describe("eventOutbox unit", () => {
  it("validates outbox event with cityCode", () => {
    const result = eventOutboxSchema.safeParse({
      eventId: "evt_1",
      eventType: "order.paid",
      aggregateType: "order",
      aggregateId: "ord_1",
      cityCode: "hangzhou",
      payload: { orderId: "ord_1" },
      status: "pending",
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("validates order.paid payload", () => {
    const result = orderPaidEventPayloadSchema.safeParse({
      orderId: "ord_1",
      cityCode: "hangzhou",
      customerId: "c1",
      skuId: "sku_home_daily_2h",
      amount: 89,
      paidAt: new Date().toISOString(),
    });
    expect(result.success).toBe(true);
  });
});
