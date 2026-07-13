import { describe, expect, it, vi } from "vitest";
import { createCustomerOrderApi } from "../../packages/api-client/src/customer.js";
import type { ApiClient, ApiRequestOptions } from "../../packages/api-client/src/createApiClient.js";
import {
  validateNotificationInboxListResponse,
  validateNotificationStateMutationResponse,
  validateNotificationUnreadCountResponse,
} from "../../packages/api-client/src/notification.js";
import { createWorkerApi } from "../../packages/api-client/src/worker.js";

function recordingClient() {
  const get = vi.fn().mockResolvedValue(undefined);
  const post = vi.fn().mockResolvedValue(undefined);
  return { client: { get, post } as unknown as ApiClient, get, post };
}

const item = {
  notificationId: "notification-1",
  eventType: "order.created",
  templateRevisionId: "template-revision-1",
  title: "订单已创建",
  body: "订单 order-1 已创建",
  reference: { kind: "order_created", orderId: "order-1" },
  occurredAt: "2026-07-13T12:00:00.000Z",
  createdAt: "2026-07-13T12:00:00.000Z",
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
};

describe("Phase27C Notification API client contract", () => {
  it("wires exact Customer paths, cursor/view query and idempotent mutations", async () => {
    const { client, get, post } = recordingClient();
    const api = createCustomerOrderApi(client);
    await api.listNotifications({ cursor: "cursor_1", limit: 20, view: "archive" });
    await api.getNotificationUnreadCount();
    await api.markNotificationRead("notification/1", {
      expectedRowVersion: 1,
      idempotencyKey: "mark-read-001",
    });
    await api.setNotificationArchived("notification/1", {
      expectedRowVersion: 2,
      idempotencyKey: "archive-001",
      archived: true,
    });

    expect(get.mock.calls[0]?.[0]).toBe(
      "/api/customer/notifications?cursor=cursor_1&limit=20&view=archive",
    );
    expect(get.mock.calls[1]?.[0]).toBe("/api/customer/notifications/unread-count");
    expect(post.mock.calls[0]?.[0]).toBe("/api/customer/notifications/notification%2F1/read");
    expect(post.mock.calls[1]?.[0]).toBe("/api/customer/notifications/notification%2F1/archive");
    expect((post.mock.calls[0]?.[2] as ApiRequestOptions<unknown>).retry).toBe("idempotent");
    expect((post.mock.calls[1]?.[2] as ApiRequestOptions<unknown>).retry).toBe("idempotent");
  });

  it("wires equivalent Worker own-scope paths without recipient parameters", async () => {
    const { client, get, post } = recordingClient();
    const api = createWorkerApi(client);
    await api.listNotifications();
    await api.getNotificationUnreadCount();
    await api.markNotificationRead("notification-2", {
      expectedRowVersion: 3,
      idempotencyKey: "worker-read-001",
    });
    await api.setNotificationArchived("notification-2", {
      expectedRowVersion: 4,
      idempotencyKey: "worker-unarchive-001",
      archived: false,
    });

    expect(get.mock.calls[0]?.[0]).toBe("/api/worker/notifications");
    expect(get.mock.calls[1]?.[0]).toBe("/api/worker/notifications/unread-count");
    expect(post.mock.calls[0]?.[0]).toBe("/api/worker/notifications/notification-2/read");
    expect(post.mock.calls[1]?.[0]).toBe("/api/worker/notifications/notification-2/archive");
    expect(JSON.stringify([...get.mock.calls, ...post.mock.calls])).not.toContain("recipientId");
  });

  it("strictly validates public responses and rejects internal or mismatched fields", () => {
    expect(validateNotificationInboxListResponse({ ok: true, items: [item], nextCursor: null }))
      .toEqual({ ok: true, items: [item], nextCursor: null });
    expect(validateNotificationUnreadCountResponse({ ok: true, unreadCount: 2 }))
      .toEqual({ ok: true, unreadCount: 2 });
    expect(validateNotificationStateMutationResponse({
      ok: true,
      result: { outcome: "applied", rowVersion: 2 },
    })).toEqual({ ok: true, result: { outcome: "applied", rowVersion: 2 } });

    expect(() => validateNotificationInboxListResponse({
      ok: true,
      items: [{ ...item, cityCode: "hangzhou" }],
      nextCursor: null,
    })).toThrow();
    expect(() => validateNotificationInboxListResponse({
      ok: true,
      items: [{ ...item, reference: { kind: "support_ticket_resolved", ticketId: "ticket-1" } }],
      nextCursor: null,
    })).toThrow();
    expect(() => validateNotificationStateMutationResponse({
      ok: true,
      result: { outcome: "complete", rowVersion: 2 },
    })).toThrow();
    expect(() => validateNotificationInboxListResponse({
      ok: true,
      items: [],
      nextCursor: "not a base64url cursor",
    })).toThrow();
  });
});
