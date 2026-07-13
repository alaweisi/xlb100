import { describe, it, expect } from "vitest";
import { eventOutboxSchema, outboxEventTypeSchema } from "@xlb/validators";

describe("eventOutbox contract", () => {
  it("supports order.created order.paid payment.paid", () => {
    for (const eventType of ["order.created", "order.paid", "payment.paid"]) {
      expect(outboxEventTypeSchema.safeParse(eventType).success).toBe(true);
    }
  });

  it("carries explicit majors for review events while defaulting legacy events to implicit-v0", () => {
    expect(outboxEventTypeSchema.safeParse("review.created").success).toBe(true);
    expect(outboxEventTypeSchema.safeParse("review.visibility.changed").success).toBe(true);
    const legacy = eventOutboxSchema.parse({
      eventId: "evt_legacy",
      eventType: "order.created",
      aggregateType: "order",
      aggregateId: "ord_legacy",
      cityCode: "hangzhou",
      payload: {},
      status: "pending",
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
    expect(legacy.eventMajorVersion).toBe(0);
    expect(eventOutboxSchema.safeParse({ ...legacy, eventMajorVersion: -1 }).success).toBe(false);
    expect(eventOutboxSchema.safeParse({ ...legacy, eventMajorVersion: 1.5 }).success).toBe(false);
    expect(eventOutboxSchema.safeParse({ ...legacy, eventType: "review.created" }).success).toBe(false);
    expect(eventOutboxSchema.safeParse({
      ...legacy,
      eventType: "review.created",
      eventMajorVersion: 1,
    }).success).toBe(true);
    expect(eventOutboxSchema.safeParse({
      ...legacy,
      eventType: "review.visibility.changed",
    }).success).toBe(false);
    expect(eventOutboxSchema.safeParse({
      ...legacy,
      eventType: "review.visibility.changed",
      eventMajorVersion: 1,
    }).success).toBe(true);
  });

  it("supports settlement preparation and confirmation audit events", () => {
    for (const eventType of ["settlement.prepared", "settlement.confirmed", "conflict_audit"]) {
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
