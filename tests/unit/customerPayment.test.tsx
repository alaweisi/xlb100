// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
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
  CUSTOMER_PAYMENT_CAPABILITY,
  CUSTOMER_PAYMENT_COMPONENTS,
  CUSTOMER_PAYMENT_GAP_REASON,
  CustomerPaymentActionController,
  CustomerPaymentPage,
  CustomerPaymentTemplate,
  createCustomerPaymentComponentRegistry,
  customerPaymentRouteModule,
  customerPaymentSlice,
  customerPaymentStateForRoute,
  customerPaymentTemplateRegistration,
  parseCustomerPaymentRoute,
  type CustomerPaymentNavigation,
} from "../../apps/customer/src/features/payment/index.js";

function route(paymentOrderId = "payment-order_safe-1") {
  return {
    pathname: `/payment/${paymentOrderId}`,
    pattern: "/payment/:paymentOrderId" as const,
    params: { paymentOrderId },
    query: {},
  };
}

function navigation(): CustomerPaymentNavigation {
  return {
    openOrders: vi.fn(),
  };
}

describe("Customer CSL-08 Payment GAP-02 boundary", () => {
  it("registers the protected fixed L1 route with Manifest forbidden", async () => {
    const components = createCustomerPaymentComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerPaymentTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerPaymentRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_PAYMENT_COMPONENTS);
    expect(customerPaymentSlice.guards).toEqual([
      "session",
      "city",
      "protected-route",
    ]);
    expect(templates.resolveForSlice(customerPaymentSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routes.resolve("/payment/:paymentOrderId")?.slice.id).toBe("CSL-08");
    await expect(routes.resolve("/payment/:paymentOrderId")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerPaymentPage);
  });

  it("accepts only an exact strictly safe identifier", () => {
    expect(parseCustomerPaymentRoute(route())).toEqual({
      paymentOrderId: "payment-order_safe-1",
    });
    expect(parseCustomerPaymentRoute(route("a".repeat(64)))).toEqual({
      paymentOrderId: "a".repeat(64),
    });

    for (const malicious of [
      "",
      "a".repeat(65),
      "../other",
      "payment/../../profile",
      "payment%2Fother",
      "payment?next=https://evil.example",
      "payment#fragment",
      "支付单-1",
      "-payment",
    ]) {
      expect(parseCustomerPaymentRoute(route(malicious))).toBeNull();
    }
    expect(parseCustomerPaymentRoute({
      ...route(),
      query: { orderId: "guessed-order" },
    })).toBeNull();
    expect(parseCustomerPaymentRoute({
      ...route(),
      params: {
        paymentOrderId: "payment-order_safe-1",
        orderId: "guessed-order",
      },
    })).toBeNull();
  });

  it("collapses valid and malicious identifiers to the same GAP-02 state", () => {
    const expected = {
      status: "unavailable",
      capability: CUSTOMER_PAYMENT_CAPABILITY,
      reasonCode: CUSTOMER_PAYMENT_GAP_REASON,
      recovery: null,
    };
    expect(customerPaymentStateForRoute(route())).toEqual(expected);
    expect(customerPaymentStateForRoute(route("../other"))).toEqual(expected);
  });

  it("renders the same unavailable boundary without disclosing the identifier", () => {
    const nav = navigation();
    const { rerender } = render(
      <CustomerPaymentPage
        slice={customerPaymentSlice}
        route={route("payment-order-secret")}
        navigation={nav}
      />,
    );
    expect(screen.getByText("blocked_by_gap_02")).toBeTruthy();
    expect(screen.getByText(/真实支付 Provider/u)).toBeTruthy();
    expect(screen.queryByText("payment-order-secret")).toBeNull();

    rerender(
      <CustomerPaymentPage
        slice={customerPaymentSlice}
        route={route("../other")}
        navigation={nav}
      />,
    );
    expect(screen.getByText("blocked_by_gap_02")).toBeTruthy();
    expect(screen.queryByText("../other")).toBeNull();
  });

  it("exposes only a deterministic return to the order center", () => {
    const nav = navigation();
    const controller = new CustomerPaymentActionController(nav);
    expect(controller.returnToOrders()).toEqual({
      status: "navigated",
      route: "/orders",
    });
    expect(nav.openOrders).toHaveBeenCalledTimes(1);
  });

  it("wires the only rendered action to /orders", () => {
    const nav = navigation();
    render(
      <CustomerPaymentPage
        slice={customerPaymentSlice}
        route={route()}
        navigation={nav}
      />,
    );
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe("返回订单中心");
    fireEvent.click(buttons[0]!);
    expect(nav.openOrders).toHaveBeenCalledTimes(1);
  });

  it("preserves generic loading, error and conflict seams without success UI", () => {
    const base = {
      slice: customerPaymentSlice,
      route: route(),
      actions: { returnToOrders: vi.fn() },
    };
    const { rerender } = render(
      <CustomerPaymentTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在检查支付能力")).toBeTruthy();

    rerender(
      <CustomerPaymentTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "payment_capability_unconfirmed",
          retryable: false,
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("支付能力无法安全确认")).toBeTruthy();

    rerender(
      <CustomerPaymentTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "payment_fact_changed",
          refreshRequired: true,
          recovery: { actionKey: "future-refresh", labelKey: "刷新" },
        }}
      />,
    );
    expect(screen.getByText("支付事实需要重新确认")).toBeTruthy();
    expect(screen.queryByText(/支付成功|重试支付|模拟支付/u)).toBeNull();
  });
});
