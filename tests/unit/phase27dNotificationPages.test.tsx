// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationInboxItem } from "@xlb/types";
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

describe("Phase27D retained Worker notification page", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn(matchMedia) });
  });

  afterEach(() => cleanup());

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
    { name: "Worker", Component: WorkerNotificationsPage, read: "Mark as read", archiveTab: "Archive" },
  ])("prevents $name view changes while a mutation is pending", async ({ Component, read, archiveTab }) => {
    const deferred = deferredMutation();
    const listNotifications = vi.fn().mockResolvedValue({ ok: true, items: [orderItem], nextCursor: null });
    const api = {
      listNotifications,
      markNotificationRead: vi.fn(() => deferred.promise),
      setNotificationArchived: vi.fn((_id, _body) => mutationResult(2)),
    };
    render(<Component api={api} />);

    fireEvent.click(await screen.findByRole("button", { name: read }));
    const archive = within(screen.getByRole("tablist", { name: "Notification view" }))
      .getByRole("button", { name: archiveTab });
    expect(archive).toHaveProperty("disabled", true);
    fireEvent.click(archive);
    expect(listNotifications).toHaveBeenCalledTimes(1);

    deferred.resolve(await mutationResult(2));
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
    expect(listNotifications).toHaveBeenLastCalledWith({ view: "inbox", limit: 20 });
  });
});
