// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationInboxItem } from "@xlb/types";
import {
  CustomerNotificationsPage,
  type CustomerNotificationApi,
} from "../../apps/customer/src/pages/CustomerNotificationsPage";

const timestamp = "2026-07-22T08:30:00.000Z";

const orderItem: NotificationInboxItem = {
  notificationId: "notification-order-a5",
  eventType: "order.created",
  templateRevisionId: "template-order-a5",
  title: "师傅已接单",
  body: "订单 XLB-20260722 已由王师傅接单，请留意后续上门进展。",
  reference: { kind: "order_created", orderId: "order-a5" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
};

const ticketItem: NotificationInboxItem = {
  notificationId: "notification-ticket-a5",
  eventType: "support.ticket.resolved",
  templateRevisionId: "template-ticket-a5",
  title: "客服问题已处理",
  body: "您反馈的问题已有处理结果，可前往客服中心继续查看。",
  reference: { kind: "support_ticket_resolved", ticketId: "ticket-a5" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: timestamp,
  archivedAt: null,
  rowVersion: 4,
};

function matchMedia() {
  return {
    matches: false,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
}

function createApi(overrides: Partial<CustomerNotificationApi> = {}): CustomerNotificationApi {
  return {
    listNotifications: vi.fn().mockResolvedValue({ ok: true, items: [orderItem, ticketItem], nextCursor: null }),
    markNotificationRead: vi.fn().mockResolvedValue({
      ok: true,
      result: { outcome: "applied", rowVersion: 2 },
    }),
    setNotificationArchived: vi.fn().mockResolvedValue({
      ok: true,
      result: { outcome: "applied", rowVersion: 2 },
    }),
    ...overrides,
  };
}

describe("CustomerNotificationsPage A5", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(matchMedia) });
  });

  afterEach(() => cleanup());

  it("uses product copy and only claims an exact destination when the target is restorable", async () => {
    const { container } = render(<CustomerNotificationsPage api={createApi()} />);

    expect(await screen.findByRole("heading", { name: "消息中心" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/Real API|rowVersion|idempotency/i);

    const orderLink = screen.getByRole("link", { name: "查看订单" });
    expect(orderLink.getAttribute("href")).toBe("/customer/orders?orderId=order-a5");
    expect(orderLink.getAttribute("data-target-resolution")).toBe("exact");

    const supportLink = screen.getByRole("link", { name: "前往客服" });
    expect(supportLink.getAttribute("href")).toBe("/customer/support");
    expect(supportLink.getAttribute("data-target-resolution")).toBe("section");
  });

  it("retries an initial failure into the authoritative empty state", async () => {
    let unavailable = true;
    const listNotifications = vi.fn(async () => {
      if (unavailable) throw new Error("notification API unavailable");
      return { ok: true as const, items: [], nextCursor: null };
    });
    render(<CustomerNotificationsPage api={createApi({ listNotifications })} />);

    expect(await screen.findByText("消息暂时无法加载")).toBeTruthy();
    unavailable = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("暂无消息")).toBeTruthy();
    expect(listNotifications.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps loaded messages when cursor pagination fails and retries with the same cursor", async () => {
    let cursorAttempts = 0;
    const listNotifications = vi.fn(async (query = {}) => {
      if (!("cursor" in query)) {
        return { ok: true as const, items: [orderItem], nextCursor: "cursor-a5" };
      }
      cursorAttempts += 1;
      if (cursorAttempts === 1) throw new Error("pagination unavailable");
      return { ok: true as const, items: [ticketItem], nextCursor: null };
    });
    render(<CustomerNotificationsPage api={createApi({ listNotifications })} />);

    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("更多消息暂时未加载")).toBeTruthy();
    expect(screen.getByText("师傅已接单")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "重新加载更多" }));
    expect(await screen.findByText("客服问题已处理")).toBeTruthy();
    expect(listNotifications).toHaveBeenLastCalledWith({ view: "inbox", limit: 20, cursor: "cursor-a5" });
  });

  it("surfaces server idempotency outcomes and refreshes the canonical row state", async () => {
    const listNotifications = vi.fn()
      .mockResolvedValueOnce({ ok: true, items: [orderItem], nextCursor: null })
      .mockResolvedValueOnce({
        ok: true,
        items: [{ ...orderItem, readAt: timestamp, rowVersion: 2 }],
        nextCursor: null,
      });
    const markNotificationRead = vi.fn().mockResolvedValue({
      ok: true,
      result: { outcome: "already_applied", rowVersion: 2 },
    });
    render(<CustomerNotificationsPage api={createApi({ listNotifications, markNotificationRead })} />);

    fireEvent.click(await screen.findByRole("button", { name: "标为已读" }));
    expect(await screen.findByText("该消息此前已标为已读，现已同步最新状态。")).toBeTruthy();
    expect(await screen.findByLabelText("已读消息：师傅已接单")).toBeTruthy();
    expect(markNotificationRead).toHaveBeenCalledWith("notification-order-a5", {
      expectedRowVersion: 1,
      idempotencyKey: expect.stringMatching(/^notification-read-/),
    });
  });

  it("does not overwrite a 409 conflict and reloads the server version", async () => {
    const listNotifications = vi.fn()
      .mockResolvedValueOnce({ ok: true, items: [orderItem], nextCursor: null })
      .mockResolvedValueOnce({
        ok: true,
        items: [{ ...orderItem, readAt: timestamp, rowVersion: 3 }],
        nextCursor: null,
      });
    const conflict = Object.assign(new Error("notification state conflict"), { status: 409 });
    const markNotificationRead = vi.fn().mockRejectedValue(conflict);
    render(<CustomerNotificationsPage api={createApi({ listNotifications, markNotificationRead })} />);

    fireEvent.click(await screen.findByRole("button", { name: "标为已读" }));
    expect(await screen.findByText("消息已在其他设备更新，现已加载服务端最新状态。")).toBeTruthy();
    expect(await screen.findByLabelText("已读消息：师傅已接单")).toBeTruthy();
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
  });
});
