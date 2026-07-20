// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CustomerAppViewport,
  CustomerRouteShell,
  customerFormalRoutes,
  customerPrimaryNavConfig,
  resolveCustomerPrimaryNavHref,
  type CustomerShellRoute,
} from "../../apps/customer/src/pages/customerPageShell";

const expectedPrimaryNavigation = [
  { label: "首页", href: "/customer/" },
  { label: "订单", href: "/customer/orders" },
  { label: "新报修", href: "/customer/order/create" },
  { label: "消息", href: "/customer/notifications" },
  { label: "我的", href: "/customer/profile" },
] as const;

const expectedActiveHrefByRoute: Readonly<Record<CustomerShellRoute, string>> = {
  home: "/customer/",
  services: "/customer/",
  createOrder: "/customer/order/create",
  orders: "/customer/orders",
  aftersale: "/customer/orders",
  support: "/customer/notifications",
  notifications: "/customer/notifications",
  profile: "/customer/profile",
  coupons: "/customer/profile",
};

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

describe("customer primary navigation", () => {
  it("keeps the complete nine-route customer app surface in one shell contract", () => {
    expect(Object.values(customerFormalRoutes)).toEqual([
      "/customer/",
      "/customer/services",
      "/customer/order/create",
      "/customer/orders",
      "/customer/aftersale",
      "/customer/support",
      "/customer/notifications",
      "/customer/coupons",
      "/customer/profile",
    ]);
  });

  it("marks the login gate as part of the customer app viewport", () => {
    const { container } = render(
      <CustomerAppViewport route="auth">
        <main>登录中</main>
      </CustomerAppViewport>,
    );
    expect(container.querySelector('[data-customer-shell="true"][data-customer-route="auth"]')).not.toBeNull();
    expect(container.querySelector(".customer-device-frame")).not.toBeNull();
  });

  it("has one stable five-item navigation model with home first", () => {
    expect(customerPrimaryNavConfig.map(({ label, href }) => ({ label, href }))).toEqual(expectedPrimaryNavigation);
  });

  it.each(Object.entries(expectedActiveHrefByRoute) as Array<[CustomerShellRoute, string]>) (
    "maps the %s functional route to its primary destination",
    (route, expectedHref) => {
      expect(resolveCustomerPrimaryNavHref(route)).toBe(expectedHref);
    },
  );

  it.each(Object.entries(expectedActiveHrefByRoute) as Array<[CustomerShellRoute, string]>) (
    "renders only the five primary items for %s",
    (route, expectedHref) => {
      const { unmount } = render(
        <CustomerRouteShell currentRoute={route}>
          <main>route content</main>
        </CustomerRouteShell>,
      );

      const navigation = screen.getByRole("navigation");
      const shell = navigation.closest('[data-customer-shell="true"]');
      expect(shell?.getAttribute("data-customer-route")).toBe(route);
      expect(shell?.querySelector(".customer-device-frame")).not.toBeNull();
      const links = Array.from(navigation.querySelectorAll("a"));
      expect(links).toHaveLength(5);
      expect(links.map((link) => link.textContent)).toEqual(expectedPrimaryNavigation.map((item) => item.label));
      expect(navigation.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(expectedHref);

      unmount();
    },
  );

  it("keeps the bottom navigation fixed in desktop preview mode too", () => {
    vi.mocked(window.matchMedia).mockReturnValue({
      matches: false,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    });
    const { container } = render(
      <CustomerRouteShell currentRoute="createOrder">
        <main>预约服务</main>
      </CustomerRouteShell>,
    );
    expect(container.querySelector('[data-shell-mode="preview"]')).not.toBeNull();
    expect(screen.getByRole("navigation").style.position).toBe("fixed");
  });
});
