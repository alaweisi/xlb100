// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import type {
  NotificationInboxItem,
  NotificationStateMutationResponse,
} from "@xlb/types";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_NOTIFICATION_COMPONENTS,
  CustomerNotificationTemplate,
  NotificationCenterActionController,
  NotificationCenterCoordinator,
  NotificationCenterPage,
  createCustomerNotificationComponentRegistry,
  customerNotificationCenterRouteModule,
  customerNotificationCenterSlice,
  customerNotificationTemplateRegistration,
  mergeNotificationItems,
  notificationReferenceRoute,
  parseNotificationCenterRoute,
  type CustomerNotificationNavigation,
} from "../../apps/customer/src/features/notifications/index.js";

const timestamp = "2026-07-24T08:00:00.000Z";

function orderNotification(
  overrides: Partial<NotificationInboxItem> = {},
): NotificationInboxItem {
  return {
    notificationId: "notification-order-1",
    eventType: "order.created",
    templateRevisionId: "template-order-r1",
    title: "订单已创建",
    body: "订单已由服务端创建，可查看详情。",
    reference: { kind: "order_created", orderId: "ord-safe_1" },
    occurredAt: timestamp,
    createdAt: timestamp,
    readAt: null,
    archivedAt: null,
    rowVersion: 1,
    ...overrides,
  };
}

function ticketNotification(
  overrides: Partial<NotificationInboxItem> = {},
): NotificationInboxItem {
  return {
    notificationId: "notification-ticket-1",
    eventType: "support.ticket.resolved",
    templateRevisionId: "template-ticket-r1",
    title: "客服工单已解决",
    body: "客服工单已有正式解决结果。",
    reference: {
      kind: "support_ticket_resolved",
      ticketId: "ticket-safe_1",
    },
    occurredAt: timestamp,
    createdAt: timestamp,
    readAt: timestamp,
    archivedAt: null,
    rowVersion: 2,
    ...overrides,
  };
}

function route(
  query: Readonly<Record<string, string>> = {},
) {
  return {
    pathname: "/notifications",
    pattern: "/notifications" as const,
    params: {},
    query,
  };
}

function navigation(): CustomerNotificationNavigation {
  return {
    back: vi.fn(),
    showView: vi.fn(),
    openRoute: vi.fn(),
  };
}

function mutationResponse(rowVersion: number): NotificationStateMutationResponse {
  return {
    ok: true,
    result: { outcome: "applied", rowVersion },
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    listNotifications: vi.fn().mockResolvedValue({
      ok: true,
      items: [orderNotification()],
      nextCursor: null,
    }),
    getNotificationUnreadCount: vi.fn().mockResolvedValue({
      ok: true,
      unreadCount: 1,
    }),
    markNotificationRead: vi.fn().mockResolvedValue(mutationResponse(2)),
    setNotificationArchived: vi.fn().mockResolvedValue(mutationResponse(2)),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("Customer CSL-17 Notification Center", () => {
  it("registers one fixed L1 route and a closed component plan", async () => {
    const componentRegistry = createCustomerNotificationComponentRegistry();
    const templateRegistry = new CustomerTemplateRegistry()
      .register(customerNotificationTemplateRegistration)
      .seal();
    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerNotificationCenterRouteModule)
      .seal();

    expect(componentRegistry.list()).toEqual(CUSTOMER_NOTIFICATION_COMPONENTS);
    expect(
      templateRegistry.resolveForSlice(customerNotificationCenterSlice),
    ).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routeRegistry.resolve("/notifications")?.slice.id).toBe("CSL-17");
    await expect(routeRegistry.resolve("/notifications")?.load()).resolves
      .toHaveProperty("RouteComponent", NotificationCenterPage);
  });

  it("accepts only inbox/archive and opaque safe cursors", () => {
    expect(parseNotificationCenterRoute(route())).toEqual({
      view: "inbox",
      cursor: null,
    });
    expect(parseNotificationCenterRoute(route({
      view: "archive",
      cursor: "cursor_page-2",
    }))).toEqual({
      view: "archive",
      cursor: "cursor_page-2",
    });
    expect(parseNotificationCenterRoute(route({ view: "system" }))).toBeNull();
    expect(parseNotificationCenterRoute(route({ cursor: "../other-user" })))
      .toBeNull();
  });

  it("deduplicates cursor pages and never replaces a newer rowVersion", () => {
    const original = orderNotification({ rowVersion: 3, title: "新事实" });
    const olderDuplicate = orderNotification({ rowVersion: 2, title: "旧事实" });
    expect(mergeNotificationItems(
      [original],
      [olderDuplicate, ticketNotification()],
    )).toEqual([
      original,
      ticketNotification(),
    ]);
  });

  it("loads more with the server cursor and deduplicates overlapping pages", async () => {
    const customerApi = api({
      listNotifications: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          items: [orderNotification()],
          nextCursor: "cursor-next",
        })
        .mockResolvedValueOnce({
          ok: true,
          items: [
            orderNotification({ rowVersion: 2, title: "订单已更新" }),
            ticketNotification(),
          ],
          nextCursor: null,
        }),
    });

    render(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new NotificationCenterCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );

    await screen.findByRole("article", { name: "未读通知：订单已创建" });
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    await screen.findByText("订单已更新");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(customerApi.listNotifications).toHaveBeenNthCalledWith(2, {
      view: "inbox",
      limit: 20,
      cursor: "cursor-next",
    });
  });

  it("discards an older inbox response after a newer archive request", async () => {
    const inbox = deferred<{
      ok: true;
      items: NotificationInboxItem[];
      nextCursor: null;
    }>();
    const listNotifications = vi.fn()
      .mockImplementationOnce(() => inbox.promise)
      .mockResolvedValueOnce({
        ok: true,
        items: [ticketNotification({ archivedAt: timestamp })],
        nextCursor: null,
      });
    const coordinator = new NotificationCenterCoordinator(api({
      listNotifications,
    }));
    const { rerender } = render(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );

    rerender(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route({ view: "archive" })}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation()}
      />,
    );

    await screen.findByRole("article", {
      name: "已读通知：客服工单已解决",
    });
    inbox.resolve({
      ok: true,
      items: [orderNotification()],
      nextCursor: null,
    });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "已归档" })
        .getAttribute("aria-selected")).toBe("true");
    });
    expect(screen.queryByText("订单已创建")).toBeNull();
  });

  it("sends CAS plus idempotency and refreshes after a 409 without replay", async () => {
    const refreshed = orderNotification({
      readAt: timestamp,
      rowVersion: 2,
    });
    const conflict = new ApiClientError({
      kind: "http",
      message: "notification conflict",
      method: "POST",
      path: "/api/customer/notifications/notification-order-1/read",
      status: 409,
    });
    const customerApi = api({
      listNotifications: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          items: [orderNotification()],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          ok: true,
          items: [refreshed],
          nextCursor: null,
        }),
      getNotificationUnreadCount: vi.fn()
        .mockResolvedValueOnce({ ok: true, unreadCount: 1 })
        .mockResolvedValueOnce({ ok: true, unreadCount: 0 }),
      markNotificationRead: vi.fn().mockRejectedValue(conflict),
    });

    render(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new NotificationCenterCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "标为已读" }));
    expect(await screen.findByText(/已刷新服务端最新状态/)).toBeTruthy();
    expect(customerApi.markNotificationRead).toHaveBeenCalledTimes(1);
    expect(customerApi.markNotificationRead).toHaveBeenCalledWith(
      "notification-order-1",
      {
        expectedRowVersion: 1,
        idempotencyKey: expect.stringMatching(
          /^customer-notification-read-/u,
        ),
      },
    );
    expect(customerApi.listNotifications).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "标为已读" })).toBeNull();
    expect(screen.getByText("0")).toBeTruthy();
  });

  it("keeps the item in place while archiving, then trusts the refreshed API", async () => {
    const archive = deferred<NotificationStateMutationResponse>();
    const customerApi = api({
      listNotifications: vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          items: [orderNotification()],
          nextCursor: null,
        })
        .mockResolvedValueOnce({
          ok: true,
          items: [],
          nextCursor: null,
        }),
      setNotificationArchived: vi.fn(() => archive.promise),
      getNotificationUnreadCount: vi.fn()
        .mockResolvedValueOnce({ ok: true, unreadCount: 1 })
        .mockResolvedValueOnce({ ok: true, unreadCount: 0 }),
    });

    render(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new NotificationCenterCoordinator(customerApi)}
        navigation={navigation()}
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "归档" }));
    expect(await screen.findByText("正在归档")).toBeTruthy();
    expect(screen.getByRole("article", {
      name: "未读通知：订单已创建",
    })).toBeTruthy();
    archive.resolve(mutationResponse(2));

    expect(await screen.findByText("暂时没有通知")).toBeTruthy();
    expect(screen.getByText(/服务端已确认归档/)).toBeTruthy();
    expect(customerApi.setNotificationArchived).toHaveBeenCalledWith(
      "notification-order-1",
      expect.objectContaining({
        expectedRowVersion: 1,
        archived: true,
        idempotencyKey: expect.stringMatching(
          /^customer-notification-archive-/u,
        ),
      }),
    );
    expect(customerApi.listNotifications).toHaveBeenCalledTimes(2);
  });

  it("allowlists only safe order and support references", async () => {
    expect(notificationReferenceRoute(orderNotification()))
      .toBe("/orders/ord-safe_1");
    expect(notificationReferenceRoute(ticketNotification()))
      .toBe("/support/tickets/ticket-safe_1");
    expect(notificationReferenceRoute(orderNotification({
      reference: { kind: "order_created", orderId: "../other-customer" },
    }))).toBeNull();

    const nav = navigation();
    const coordinator = new NotificationCenterCoordinator(api());
    const controller = new NotificationCenterActionController(coordinator, nav);
    expect(controller.openReference(orderNotification({
      eventType: "campaign.created" as NotificationInboxItem["eventType"],
    }))).toEqual({
      status: "rejected",
      reasonCode: "unknown_reference",
    });
    expect(nav.openRoute).not.toHaveBeenCalled();

    render(
      <NotificationCenterPage
        slice={customerNotificationCenterSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new NotificationCenterCoordinator(api({
          listNotifications: vi.fn().mockResolvedValue({
            ok: true,
            items: [orderNotification({
              reference: {
                kind: "order_created",
                orderId: "../other-customer",
              },
            })],
            nextCursor: null,
          }),
        }))}
        navigation={nav}
      />,
    );
    fireEvent.click(await screen.findByRole("button", {
      name: /无法跳转/u,
    }));
    expect(await screen.findByText(/安全白名单/)).toBeTruthy();
    expect(nav.openRoute).not.toHaveBeenCalled();
  });

  it("renders loading, empty, error, conflict and unavailable boundaries", () => {
    const base = {
      slice: customerNotificationCenterSlice,
      route: route(),
    };
    const { rerender } = render(
      <CustomerNotificationTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取通知")).toBeTruthy();

    rerender(
      <CustomerNotificationTemplate
        {...base}
        state={{
          status: "empty",
          reasonCode: "no_notifications",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("暂时没有通知")).toBeTruthy();

    rerender(
      <CustomerNotificationTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "notifications_load_failed",
          retryable: true,
          recovery: { actionKey: "retry", labelKey: "重试" },
        }}
      />,
    );
    expect(screen.getByText("通知加载失败")).toBeTruthy();

    rerender(
      <CustomerNotificationTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "notification_changed",
          refreshRequired: true,
          recovery: { actionKey: "refresh", labelKey: "刷新" },
        }}
      />,
    );
    expect(screen.getByText("通知状态已变化")).toBeTruthy();

    rerender(
      <CustomerNotificationTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.notifications",
          reasonCode: "notifications_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会用本地历史或演示数据补齐/)).toBeTruthy();
  });
});
