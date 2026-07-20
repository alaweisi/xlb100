// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  CustomerRouteShell,
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
      const links = Array.from(navigation.querySelectorAll("a"));
      expect(links).toHaveLength(5);
      expect(links.map((link) => link.textContent)).toEqual(expectedPrimaryNavigation.map((item) => item.label));
      expect(navigation.querySelector('a[aria-current="page"]')?.getAttribute("href")).toBe(expectedHref);

      unmount();
    },
  );
});
