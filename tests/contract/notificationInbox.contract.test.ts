import { describe, expect, it } from "vitest";
import {
  notificationArchiveRequestSchema,
  notificationInboxItemSchema,
  notificationInboxListQuerySchema,
  notificationInboxListResponseSchema,
  notificationMarkReadRequestSchema,
  notificationStateMutationResponseSchema,
  notificationUnreadCountResponseSchema,
} from "@xlb/validators";

const timestamp = "2026-07-13T12:00:00.000Z";
const item = {
  notificationId: "notification-1",
  eventType: "order.created",
  templateRevisionId: "template-revision-1",
  title: "订单已创建",
  body: "订单 order-1 已创建",
  reference: { kind: "order_created", orderId: "order-1" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
} as const;

describe("Phase27C own Notification inbox contracts", () => {
  it("accepts bounded opaque pagination and explicit inbox/archive views", () => {
    expect(notificationInboxListQuerySchema.parse({
      cursor: "eyJ2IjoxfQ",
      limit: 100,
      view: "archive",
    })).toEqual({ cursor: "eyJ2IjoxfQ", limit: 100, view: "archive" });
    expect(notificationInboxListQuerySchema.safeParse({ limit: 0 }).success).toBe(false);
    expect(notificationInboxListQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
    expect(notificationInboxListQuerySchema.safeParse({ view: "all" }).success).toBe(false);
    expect(notificationInboxListQuerySchema.safeParse({ recipientId: "other-user" }).success).toBe(false);
  });

  it("exposes only the frozen public inbox item shape", () => {
    expect(notificationInboxItemSchema.parse(item)).toEqual(item);
    for (const forbidden of [
      { cityCode: "hangzhou" },
      { recipientId: "customer-1" },
      { recipientType: "customer" },
      { sourceEventId: "event-1" },
      { deliveryId: "delivery-1" },
      { subscriberId: "notification-projection" },
      { sourcePayloadHash: "a".repeat(64) },
      { targetFingerprint: "b".repeat(64) },
      { leaseToken: "secret" },
    ]) {
      expect(notificationInboxItemSchema.safeParse({ ...item, ...forbidden }).success).toBe(false);
    }
  });

  it("binds the public reference discriminator to the event type", () => {
    expect(notificationInboxItemSchema.safeParse({
      ...item,
      eventType: "support.ticket.resolved",
      reference: { kind: "support_ticket_resolved", ticketId: "ticket-1" },
    }).success).toBe(true);
    expect(notificationInboxItemSchema.safeParse({
      ...item,
      eventType: "support.ticket.resolved",
    }).success).toBe(false);
    expect(notificationInboxItemSchema.safeParse({
      ...item,
      reference: { ...item.reference, totalAmount: 88 },
    }).success).toBe(false);
  });

  it("validates strict list, unread and state mutation responses", () => {
    expect(notificationInboxListResponseSchema.safeParse({
      ok: true,
      items: [item],
      nextCursor: null,
    }).success).toBe(true);
    expect(notificationUnreadCountResponseSchema.safeParse({ ok: true, unreadCount: 0 }).success).toBe(true);
    expect(notificationStateMutationResponseSchema.safeParse({
      ok: true,
      result: { outcome: "already_applied", rowVersion: 2 },
    }).success).toBe(true);
    expect(notificationUnreadCountResponseSchema.safeParse({
      ok: true,
      unreadCount: 1,
      recipientId: "customer-1",
    }).success).toBe(false);
  });

  it("requires CAS and durable idempotency inputs for read and archive/unarchive", () => {
    const mutation = { expectedRowVersion: 1, idempotencyKey: "notification-mutation-001" };
    expect(notificationMarkReadRequestSchema.parse(mutation)).toEqual(mutation);
    expect(notificationArchiveRequestSchema.parse({ ...mutation, archived: true }))
      .toEqual({ ...mutation, archived: true });
    expect(notificationArchiveRequestSchema.safeParse({ ...mutation }).success).toBe(false);
    expect(notificationArchiveRequestSchema.safeParse({
      ...mutation,
      archived: false,
      recipientId: "other-user",
    }).success).toBe(false);
    expect(notificationMarkReadRequestSchema.safeParse({
      expectedRowVersion: 0,
      idempotencyKey: "short",
    }).success).toBe(false);
  });
});
