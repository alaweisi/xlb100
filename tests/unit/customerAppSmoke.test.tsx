// @vitest-environment jsdom

import { act, render, type RenderResult } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CustomerAppRouter } from "../../apps/customer/src/routes/CustomerAppRouter.js";
import { matchCustomerRoute } from "../../apps/customer/src/routes/customerRouteMatcher.js";

describe("Customer App BI route smoke", () => {
  it("loads the Home, Auth, Location, protected dynamic, Payment GAP and Refund modules", async () => {
    const routes = [
      "/",
      "/auth/login",
      "/location",
      "/orders/safe-order",
      "/payment/safe-payment",
      "/orders/safe-order/refund",
    ];

    for (const pathname of routes) {
      const match = matchCustomerRoute(pathname);
      expect(match, pathname).not.toBeNull();
      const loaded = await match!.published.registration.load();
      expect(loaded.RouteComponent, pathname).toBeTypeOf("function");
    }

    const payment = matchCustomerRoute("/payment/safe-payment")!;
    const paymentModule = await payment.published.registration.load();
    const PaymentRoute = paymentModule.RouteComponent;
    const view = render(
      <PaymentRoute
        slice={payment.published.registration.slice}
        route={payment.route}
      />,
    );

    expect(view.container.querySelector(".xlb-payment-shell")).not.toBeNull();
    expect(view.container.textContent).toMatch(/支付/);
  });

  it("renders a safe 404 without echoing the hostile path", async () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    window.localStorage.clear();
    window.history.replaceState(null, "", "/missing/private/resource");
    let view!: RenderResult;
    await act(async () => {
      view = render(<CustomerAppRouter />);
      await Promise.resolve();
    });

    await vi.waitFor(() => {
      expect(view.container.querySelector("[data-route-not-found=true]")).not.toBeNull();
    });
    expect(view.container.textContent).not.toContain("missing/private/resource");
  });
});
