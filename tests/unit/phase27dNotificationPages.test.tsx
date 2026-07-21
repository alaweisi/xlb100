// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationInboxItem } from "@xlb/types";
import {
  CustomerNotificationsPage,
  type CustomerNotificationApi,
} from "../../apps/customer/src/pages/CustomerNotificationsPage";
import { WorkerNotificationsPage } from "../../apps/worker/src/pages/WorkerNotificationsPage";

const timestamp = "2026-07-13T12:00:00.000Z";
const orderItem: NotificationInboxItem = {
  notificationId: "notification-order-1",
  eventType: "order.created",
  templateRevisionId: "template-revision-order-1",
  title: "Order created",
  body: "Order order-1 is ready to review.",
  reference: { kind: "order_created", orderId: "order-1" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: null,
  archivedAt: null,
  rowVersion: 1,
};
const ticketItem: NotificationInboxItem = {
  notificationId: "notification-ticket-1",
  eventType: "support.ticket.resolved",
  templateRevisionId: "template-revision-ticket-1",
  title: "Support ticket resolved",
  body: "Ticket ticket-1 was resolved.",
  reference: { kind: "support_ticket_resolved", ticketId: "ticket-1" },
  occurredAt: timestamp,
  createdAt: timestamp,
  readAt: timestamp,
  archivedAt: timestamp,
  rowVersion: 3,
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

function mutationResult(rowVersion: number) {
  return Promise.resolve({ ok: true as const, result: { outcome: "applied" as const, rowVersion } });
}

function deferredMutation() {
  let resolve!: (value: Awaited<ReturnType<typeof mutationResult>>) => void;
  const promise = new Promise<Awaited<ReturnType<typeof mutationResult>>>((done) => { resolve = done; });
  return { promise, resolve };
}

function CustomerNotificationsPageForTest({ api }: { api: CustomerNotificationApi }) {
  return <CustomerNotificationsPage api={api} cityCode="330100" />;
}

describe("Phase27D Customer/Worker notification pages", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(matchMedia) });
  });

  afterEach(() => cleanup());

  it("renders Customer unread state, safe order navigation and cursor loading", async () => {
    const listNotifications = vi.fn()
      .mockResolvedValueOnce({ ok: true, items: [orderItem], nextCursor: "cursor_1" })
      .mockResolvedValueOnce({ ok: true, items: [ticketItem], nextCursor: null });
    const api = {
      listNotifications,
      markNotificationRead: vi.fn((_id, _body) => mutationResult(2)),
      setNotificationArchived: vi.fn((_id, _body) => mutationResult(2)),
    };
    render(<CustomerNotificationsPage api={api} cityCode="330100" />);

    expect(await screen.findByLabelText("未读消息：Order created")).toBeTruthy();
    expect(screen.getByRole("link", { name: "查看订单" }).getAttribute("href"))
      .toBe("/customer/orders?cityCode=330100&orderId=order-1");
    expect(screen.queryByRole("link", { name: /ticket/i })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    expect(await screen.findByText("Support ticket resolved")).toBeTruthy();
    expect(listNotifications).toHaveBeenLastCalledWith({ view: "inbox", limit: 20, cursor: "cursor_1" });
  });

  it("uses CAS/idempotency for Customer mark-read, archive and restore", async () => {
    const listNotifications = vi.fn(async ({ view }: { view?: string } = {}) => ({
      ok: true as const,
      items: view === "archive" ? [ticketItem] : [orderItem],
      nextCursor: null,
    }));
    const markNotificationRead = vi.fn((_id, _body) => mutationResult(2));
    const setNotificationArchived = vi.fn((_id, _body) => mutationResult(2));
    render(<CustomerNotificationsPage api={{ listNotifications, markNotificationRead, setNotificationArchived }} cityCode="330100" />);

    fireEvent.click(await screen.findByRole("button", { name: "标为已读" }));
    await waitFor(() => expect(markNotificationRead).toHaveBeenCalledWith("notification-order-1", {
      expectedRowVersion: 1,
      idempotencyKey: expect.stringMatching(/^notification-read-/),
    }));

    fireEvent.click(screen.getByRole("button", { name: "归档" }));
    await waitFor(() => expect(setNotificationArchived).toHaveBeenCalledWith("notification-order-1", {
      expectedRowVersion: 1,
      idempotencyKey: expect.stringMatching(/^notification-archive-/),
      archived: true,
    }));
    await waitFor(() => expect(listNotifications.mock.calls.length).toBeGreaterThanOrEqual(3));

    fireEvent.click(screen.getByRole("tab", { name: "已归档" }));
    await waitFor(() => expect(listNotifications).toHaveBeenLastCalledWith({ view: "archive", limit: 20 }));
    const restore = await screen.findByRole("button", { name: "恢复" });
    await waitFor(() => expect(restore).not.toHaveProperty("disabled", true));
    fireEvent.click(restore);
    await waitFor(() => expect(setNotificationArchived).toHaveBeenLastCalledWith("notification-ticket-1", {
      expectedRowVersion: 3,
      idempotencyKey: expect.stringMatching(/^notification-restore-/),
      archived: false,
    }));
  });

  it("reloads Worker canonical state after a CAS conflict without unsafe deep links", async () => {
    const listNotifications = vi.fn()
      .mockResolvedValueOnce({ ok: true, items: [orderItem], nextCursor: null })
      .mockResolvedValueOnce({ ok: true, items: [{ ...orderItem, readAt: timestamp, rowVersion: 2 }], nextCursor: null });
    const conflict = Object.assign(new Error("notification state conflict 409"), { status: 409 });
    const markNotificationRead = vi.fn().mockRejectedValue(conflict);
    render(<WorkerNotificationsPage api={{
      listNotifications,
      markNotificationRead,
      setNotificationArchived: vi.fn((_id, _body) => mutationResult(2)),
    }} />);

    fireEvent.click(await screen.findByRole("button", { name: "Mark as read" }));
    expect(await screen.findByText("Notification changed on another device. Latest state reloaded.")).toBeTruthy();
    expect(await screen.findByLabelText("Read notification: Order created")).toBeTruthy();
    expect(listNotifications).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("shows Worker load error and retries to an honest empty state", async () => {
    const listNotifications = vi.fn()
      .mockRejectedValueOnce(new Error("notification API unavailable"))
      .mockResolvedValueOnce({ ok: true, items: [], nextCursor: null });
    render(<WorkerNotificationsPage api={{
      listNotifications,
      markNotificationRead: vi.fn((_id, _body) => mutationResult(2)),
      setNotificationArchived: vi.fn((_id, _body) => mutationResult(2)),
    }} />);

    expect((await screen.findByRole("alert")).textContent).toContain("notification API unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No notifications")).toBeTruthy();
    expect(listNotifications).toHaveBeenCalledTimes(2);
  });

  it.each([
    {
      name: "Customer",
      Component: CustomerNotificationsPageForTest,
      read: "标为已读",
      archiveTab: "已归档",
      tablistLabel: "消息分类",
      archiveRole: "tab" as const,
    },
    {
      name: "Worker",
      Component: WorkerNotificationsPage,
      read: "Mark as read",
      archiveTab: "Archive",
      tablistLabel: "Notification view",
      archiveRole: "button" as const,
    },
  ])("prevents $name view changes while a mutation is pending", async ({
    Component,
    read,
    archiveTab,
    tablistLabel,
    archiveRole,
  }) => {
    const deferred = deferredMutation();
    const listNotifications = vi.fn().mockResolvedValue({ ok: true, items: [orderItem], nextCursor: null });
    const api = {
      listNotifications,
      markNotificationRead: vi.fn(() => deferred.promise),
      setNotificationArchived: vi.fn((_id, _body) => mutationResult(2)),
    };
    render(<Component api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: read }));
    const archive = within(screen.getByRole("tablist", { name: tablistLabel }))
      .getByRole(archiveRole, { name: archiveTab });
    expect(archive).toHaveProperty("disabled", true);
    fireEvent.click(archive);
    expect(listNotifications).toHaveBeenCalledTimes(1);

    deferred.resolve(await mutationResult(2));
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith({ view: "inbox", limit: 20 });
  });
});
