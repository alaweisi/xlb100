// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import {
  ApiClientError,
  type customerApi,
} from "@xlb/api-client";
import type {
  CustomerOrderSummary,
  CustomerOrderListResponse,
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
  CUSTOMER_ORDER_CENTER_COMPONENTS,
  CustomerOrderCenterActionController,
  CustomerOrderCenterCoordinator,
  CustomerOrderCenterPage,
  CustomerOrderCenterTemplate,
  createCustomerOrderCenterComponentRegistry,
  customerOrderCenterRouteModule,
  customerOrderCenterSlice,
  customerOrderCenterTemplateRegistration,
  mergeCustomerOrderSummaries,
  orderCenterFilterForStatus,
  parseCustomerOrderCenterRoute,
  safeCustomerOrderDetailRoute,
  type CustomerOrderCenterNavigation,
} from "../../apps/customer/src/features/orders/index.js";

const timestamp = "2026-07-24T10:00:00.000Z";

function order(
  overrides: Partial<CustomerOrderSummary> = {},
): CustomerOrderSummary {
  return {
    orderId: "order-center-1",
    cityCode: "hangzhou",
    skuId: "sku_home_daily_2h",
    skuName: "日常保洁2小时",
    quantity: 1,
    unit: "次",
    scheduledAt: timestamp,
    scheduledTimeSlot: "morning",
    priceText: "¥89/2小时",
    totalAmount: 89,
    currency: "CNY",
    status: "pending_dispatch",
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function route(
  query: Readonly<Record<string, string>> = {},
) {
  return {
    pathname: "/orders",
    pattern: "/orders" as const,
    params: {},
    query,
  };
}

function navigation(): CustomerOrderCenterNavigation {
  return {
    showFilter: vi.fn(),
    openRoute: vi.fn(),
  };
}

type CustomerApi = Pick<
  ReturnType<typeof customerApi.forClient>,
  "listOrders"
>;

function api(
  listOrders = vi.fn(async (): Promise<CustomerOrderListResponse> => ({
    ok: true,
    items: [order()],
    nextCursor: null,
  })),
): CustomerApi {
  return { listOrders };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function httpError(status: number) {
  return new ApiClientError({
    kind: "http",
    message: `HTTP ${status}`,
    method: "GET",
    path: "/api/customer/orders",
    status,
  });
}

describe("Customer CSL-09 Order Center", () => {
  it("registers the fixed protected L1 route with Manifest forbidden", async () => {
    const components = createCustomerOrderCenterComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerOrderCenterTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerOrderCenterRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_ORDER_CENTER_COMPONENTS);
    expect(customerOrderCenterSlice.guards).toEqual([
      "session",
      "city",
      "protected-route",
    ]);
    expect(templates.resolveForSlice(customerOrderCenterSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routes.resolve("/orders")?.slice.id).toBe("CSL-09");
    await expect(routes.resolve("/orders")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerOrderCenterPage);
  });

  it("parses only /orders with controlled filters and opaque cursors", () => {
    expect(parseCustomerOrderCenterRoute(route())).toEqual({
      filter: "all",
      cursor: null,
    });
    expect(parseCustomerOrderCenterRoute(route({
      filter: "active",
      cursor: "cursor_page-2",
    }))).toEqual({
      filter: "active",
      cursor: "cursor_page-2",
    });
    expect(parseCustomerOrderCenterRoute(route({ filter: "paid" }))).toBeNull();
    expect(parseCustomerOrderCenterRoute(route({ cursor: "../other-user" })))
      .toBeNull();
    expect(parseCustomerOrderCenterRoute(route({ customerId: "other" })))
      .toBeNull();
    expect(parseCustomerOrderCenterRoute({
      ...route(),
      pathname: "/orders/order-center-1",
    })).toBeNull();
  });

  it("uses the formal server filter without inventing order states", async () => {
    const listOrders = vi.fn(async (): Promise<CustomerOrderListResponse> => ({
      ok: true,
      items: [],
      nextCursor: null,
    }));
    const coordinator = new CustomerOrderCenterCoordinator(api(listOrders));

    for (const filter of ["all", "active", "completed", "cancelled"] as const) {
      await coordinator.loadPage("hangzhou", filter, null);
    }

    expect(listOrders.mock.calls.map(([query]) => query)).toEqual([
      { filter: "all", limit: 20 },
      { filter: "active", limit: 20 },
      { filter: "completed", limit: 20 },
      { filter: "cancelled", limit: 20 },
    ]);
    expect(orderCenterFilterForStatus("draft")).toBe("active");
    expect(orderCenterFilterForStatus("pending_dispatch")).toBe("active");
    expect(orderCenterFilterForStatus("service_completed")).toBe("active");
    expect(orderCenterFilterForStatus("pending_payment")).toBe("active");
    expect(orderCenterFilterForStatus("paid")).toBe("completed");
    expect(orderCenterFilterForStatus("cancelled")).toBe("cancelled");
  });

  it("loads cursor pages, deduplicates overlap and keeps the newest summary", async () => {
    const first = order();
    const updated = order({
      skuName: "服务端更新后的订单",
      updatedAt: "2026-07-24T11:00:00.000Z",
    });
    const second = order({
      orderId: "order-center-2",
      skuName: "家电清洗",
    });
    const listOrders = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        items: [first],
        nextCursor: "cursor-next",
      })
      .mockResolvedValueOnce({
        ok: true,
        items: [updated, second],
        nextCursor: null,
      });

    render(
      <CustomerOrderCenterPage
        slice={customerOrderCenterSlice}
        route={route({ filter: "active" })}
        scope={{ actorId: "customer-a", cityCode: "hangzhou" }}
        coordinator={new CustomerOrderCenterCoordinator(api(listOrders))}
        navigation={navigation()}
      />,
    );

    await screen.findByRole("article", { name: /日常保洁2小时/u });
    fireEvent.click(screen.getByRole("button", { name: "加载更多" }));
    await screen.findByText("服务端更新后的订单");
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(listOrders).toHaveBeenNthCalledWith(2, {
      filter: "active",
      limit: 20,
      cursor: "cursor-next",
    });
    expect(mergeCustomerOrderSummaries([updated], [first])).toEqual([updated]);
  });

  it("applies actor/city/route latest-wins and discards the older response", async () => {
    const older = deferred<CustomerOrderListResponse>();
    const listOrders = vi.fn()
      .mockImplementationOnce(() => older.promise)
      .mockResolvedValueOnce({
        ok: true,
        items: [order({
          orderId: "order-new-scope",
          skuName: "新作用域订单",
        })],
        nextCursor: null,
      });
    const coordinator = new CustomerOrderCenterCoordinator(api(listOrders));
    const nav = navigation();
    const { rerender } = render(
      <CustomerOrderCenterPage
        slice={customerOrderCenterSlice}
        route={route({ filter: "active" })}
        scope={{ actorId: "customer-a", cityCode: "hangzhou" }}
        coordinator={coordinator}
        navigation={nav}
      />,
    );
    await waitFor(() => expect(listOrders).toHaveBeenCalledTimes(1));

    rerender(
      <CustomerOrderCenterPage
        slice={customerOrderCenterSlice}
        route={route({ filter: "completed" })}
        scope={{ actorId: "customer-b", cityCode: "hangzhou" }}
        coordinator={coordinator}
        navigation={nav}
      />,
    );
    await screen.findByText("新作用域订单");

    older.resolve({
      ok: true,
      items: [order({ skuName: "旧作用域订单" })],
      nextCursor: null,
    });
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: "已完成" })
        .getAttribute("aria-selected")).toBe("true");
    });
    expect(screen.queryByText("旧作用域订单")).toBeNull();
  });

  it.each([
    [401, "unauthenticated"],
    [409, "conflict"],
    [503, "unavailable"],
  ] as const)("maps HTTP %i to %s", async (status, expected) => {
    const coordinator = new CustomerOrderCenterCoordinator(api(
      vi.fn().mockRejectedValue(httpError(status)),
    ));
    await expect(coordinator.loadPage("hangzhou", "all"))
      .resolves.toMatchObject({ status: expected });
  });

  it("treats 403 and 404 identically without disclosing ownership facts", async () => {
    for (const status of [403, 404]) {
      const coordinator = new CustomerOrderCenterCoordinator(api(
        vi.fn().mockRejectedValue(httpError(status)),
      ));
      await expect(coordinator.loadPage("hangzhou", "all")).resolves.toEqual({
        status: "unavailable",
        capability: "customer.orders",
        reasonCode: "orders_scope_unavailable",
      });
    }
  });

  it("maps 5xx to retryable errors except explicit capability failures", async () => {
    const coordinator = new CustomerOrderCenterCoordinator(api(
      vi.fn().mockRejectedValue(httpError(500)),
    ));
    await expect(coordinator.loadPage("hangzhou", "all")).resolves.toEqual({
      status: "error",
      errorCode: "orders_load_failed",
      retryable: true,
    });
  });

  it("expires the Customer session after a 401", async () => {
    const onSessionExpired = vi.fn();
    render(
      <CustomerOrderCenterPage
        slice={customerOrderCenterSlice}
        route={route()}
        scope={{ actorId: "customer-a", cityCode: "hangzhou" }}
        coordinator={new CustomerOrderCenterCoordinator(api(
          vi.fn().mockRejectedValue(httpError(401)),
        ))}
        navigation={navigation()}
        onSessionExpired={onSessionExpired}
      />,
    );

    expect(await screen.findByText("登录状态已失效")).toBeTruthy();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });

  it("opens only a current, strictly validated order ID", async () => {
    const nav = navigation();
    const controller = new CustomerOrderCenterActionController(nav);
    const current = [order()];

    expect(safeCustomerOrderDetailRoute("order_safe-1"))
      .toBe("/orders/order_safe-1");
    for (const malicious of [
      "../other-order",
      "order/../../profile",
      "order%2Fother",
      "order?redirect=https://evil.example",
      "订单-1",
    ]) {
      expect(safeCustomerOrderDetailRoute(malicious)).toBeNull();
      expect(controller.openOrder(
        malicious,
        [order({ orderId: malicious })],
      )).toMatchObject({
        status: "rejected",
        reasonCode: "invalid_order_id",
      });
    }
    expect(controller.openOrder("order-stale", current)).toMatchObject({
      status: "rejected",
      reasonCode: "stale_order_reference",
    });
    expect(controller.openOrder("order-center-1", current)).toEqual({
      status: "navigated",
      route: "/orders/order-center-1",
    });
    expect(nav.openRoute).toHaveBeenCalledTimes(1);
  });

  it("rejects a malicious API order ID when the user opens the card", async () => {
    const nav = navigation();
    render(
      <CustomerOrderCenterPage
        slice={customerOrderCenterSlice}
        route={route()}
        scope={{ actorId: "customer-a", cityCode: "hangzhou" }}
        coordinator={new CustomerOrderCenterCoordinator(api(
          vi.fn().mockResolvedValue({
            ok: true,
            items: [order({ orderId: "../other-order" })],
            nextCursor: null,
          }),
        ))}
        navigation={nav}
      />,
    );

    fireEvent.click(await screen.findByRole("button", {
      name: /查看订单/u,
    }));
    expect(await screen.findByText(/已拒绝跳转/u)).toBeTruthy();
    expect(nav.openRoute).not.toHaveBeenCalled();
  });

  it("renders loading, empty, error, conflict and unavailable boundaries", () => {
    const base = {
      slice: customerOrderCenterSlice,
      route: route(),
    };
    const { rerender } = render(
      <CustomerOrderCenterTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在读取订单")).toBeTruthy();

    rerender(
      <CustomerOrderCenterTemplate
        {...base}
        state={{
          status: "empty",
          reasonCode: "no_orders",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("暂时没有订单")).toBeTruthy();

    rerender(
      <CustomerOrderCenterTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "orders_load_failed",
          retryable: true,
          recovery: { actionKey: "retry", labelKey: "重试" },
        }}
      />,
    );
    expect(screen.getByText("订单加载失败")).toBeTruthy();

    rerender(
      <CustomerOrderCenterTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "orders_snapshot_changed",
          refreshRequired: true,
          recovery: { actionKey: "refresh", labelKey: "刷新" },
        }}
      />,
    );
    expect(screen.getByText("订单列表已变化")).toBeTruthy();

    rerender(
      <CustomerOrderCenterTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.orders",
          reasonCode: "orders_scope_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会确认任何订单是否存在/u)).toBeTruthy();
  });
});
