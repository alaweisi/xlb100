import { describe, it, expect, vi } from "vitest";
import { eventOutboxSchema, orderPaidEventPayloadSchema } from "@xlb/validators";
import { EventOutboxRepository } from "../../backend/src/events/eventOutbox.js";

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

  it("stores legacy writers as major 0 and requires review.created to state major 1", async () => {
    const query = vi.fn().mockResolvedValue([{}]);
    const connection = { query } as never;
    const repository = new EventOutboxRepository({} as never);
    const base = {
      eventId: "evt_1",
      aggregateType: "order",
      aggregateId: "ord_1",
      cityCode: "hangzhou" as const,
      payload: {},
    };

    await repository.insertEvent(connection, { ...base, eventType: "order.created" });
    expect(query.mock.calls[0]?.[1]?.[2]).toBe(0);
    await expect(repository.insertEvent(connection, {
      ...base,
      eventId: "evt_review_missing",
      eventType: "review.created",
    })).rejects.toThrow("requires explicit event major version 1");
    await repository.insertEvent(connection, {
      ...base,
      eventId: "evt_review_1",
      eventType: "review.created",
      eventMajorVersion: 1,
    });
    expect(query.mock.calls[1]?.[1]?.[2]).toBe(1);
    await expect(repository.insertEvent(connection, {
      ...base,
      eventId: "evt_visibility_missing",
      eventType: "review.visibility.changed",
    })).rejects.toThrow("requires explicit event major version 1");
    await repository.insertEvent(connection, {
      ...base,
      eventId: "evt_visibility_1",
      eventType: "review.visibility.changed",
      eventMajorVersion: 1,
    });
    expect(query.mock.calls[2]?.[1]?.[2]).toBe(1);
  });
});
