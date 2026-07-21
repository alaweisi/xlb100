// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@xlb/api-client";
import { ThemeProvider } from "@xlb/ui";
import {
  customerPrimaryNavRoutes,
  customerRouteConfig,
  CustomerRouteShell,
  describeCustomerAppError,
  describeCustomerDeepLink,
  detectCustomerRoute,
  resolveCustomerCityCode,
  resolveCustomerPrimaryRoute,
} from "../../apps/customer/src/pages/customerPageShell";

function installMatchMedia(matches = true) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn(() => ({
      matches,
      media: "(max-width: 640px)",
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("Customer A2 app shell", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
    window.history.replaceState({}, "", "/customer/");
    installMatchMedia();
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("freezes nine route carriers onto the five-item Customer navigation", () => {
    expect(customerPrimaryNavRoutes).toEqual(["home", "support", "createOrder", "orders", "profile"]);
    expect(customerPrimaryNavRoutes.map((route) => customerRouteConfig[route].label)).toEqual([
      "首页",
      "客服",
      "新报修",
      "订单",
      "我的",
    ]);
    expect(resolveCustomerPrimaryRoute("services")).toBe("home");
    expect(resolveCustomerPrimaryRoute("notifications")).toBe("home");
    expect(resolveCustomerPrimaryRoute("aftersale")).toBe("orders");
    expect(resolveCustomerPrimaryRoute("coupons")).toBe("profile");

    expect(detectCustomerRoute("/customer/")).toBe("home");
    expect(detectCustomerRoute("/customer/services")).toBe("services");
    expect(detectCustomerRoute("/customer/order/create")).toBe("createOrder");
    expect(detectCustomerRoute("/customer/orders")).toBe("orders");
    expect(detectCustomerRoute("/customer/aftersale")).toBe("aftersale");
    expect(detectCustomerRoute("/customer/support")).toBe("support");
    expect(detectCustomerRoute("/customer/notifications")).toBe("notifications");
    expect(detectCustomerRoute("/customer/coupons")).toBe("coupons");
    expect(detectCustomerRoute("/customer/profile")).toBe("profile");
  });

  it("renders exactly five accessible navigation targets and maps child routes to their parent", () => {
    render(
      <ThemeProvider>
        <CustomerRouteShell currentRoute="aftersale"><p>售后内容</p></CustomerRouteShell>
      </ThemeProvider>,
    );

    const navigation = screen.getByRole("navigation", { name: "顾客端主导航" });
    const links = Array.from(navigation.querySelectorAll("a"));
    expect(links).toHaveLength(5);
    expect(links.map((link) => link.textContent)).toEqual(["首页", "客服", "新报修", "订单", "我的"]);
    expect(screen.getByRole("link", { name: "订单" }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "新报修" }).dataset.prominent).toBe("true");
    expect(screen.queryByRole("link", { name: "服务" })).toBeNull();
    expect(screen.queryByRole("link", { name: "售后" })).toBeNull();
  });

  it("collapses legacy page-local shells under the single app-level shell", () => {
    render(
      <ThemeProvider>
        <CustomerRouteShell currentRoute="support">
          <CustomerRouteShell currentRoute="support" topBar={<header>客服标题</header>}>
            <p>客服内容</p>
          </CustomerRouteShell>
        </CustomerRouteShell>
      </ThemeProvider>,
    );

    expect(screen.getAllByRole("navigation", { name: "顾客端主导航" })).toHaveLength(1);
    expect(screen.getByText("客服标题")).toBeTruthy();
    expect(screen.getByText("客服内容")).toBeTruthy();
  });

  it("keeps invalid-city and deep-link recovery visible without claiming business success", () => {
    window.localStorage.setItem("xlb.customer.cityCode", "hangzhou");
    window.history.replaceState({}, "", "/customer/order/create?cityCode=unknown&skuId=sku-1");

    const resolution = resolveCustomerCityCode("unknown", "hangzhou");
    expect(resolution).toEqual({ cityCode: "hangzhou", issue: "invalid-query", requestedCityCode: "unknown" });
    const deepLinkDescription = describeCustomerDeepLink("createOrder", {
      skuId: "sku-1",
      orderId: null,
      couponGrantId: null,
    });
    expect(deepLinkDescription).toContain("已读取链接中的服务或优惠参数");
    expect(deepLinkDescription).toContain("服务端返回");
    expect(deepLinkDescription).not.toContain("正在恢复");

    render(
      <ThemeProvider>
        <CustomerRouteShell currentRoute="createOrder"><p>创建订单</p></CustomerRouteShell>
      </ThemeProvider>,
    );
    expect(screen.getByText(/链接中的城市暂不可用/)).toBeTruthy();
    expect(screen.getByText(/最终可用项和价格以服务端返回为准/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "使用当前城市" }));
    expect(new URLSearchParams(window.location.search).get("cityCode")).toBe("hangzhou");
  });

  it("classifies protected global failures from authoritative HTTP and connectivity facts", () => {
    const expired = describeCustomerAppError(new ApiClientError({
      kind: "http",
      message: "expired",
      method: "GET",
      path: "/api/catalog",
      status: 401,
    }));
    const duplicate = describeCustomerAppError(new ApiClientError({
      kind: "http",
      message: "conflict",
      method: "POST",
      path: "/api/orders",
      status: 409,
      responseBody: "duplicate idempotency key",
    }));

    expect(expired.kind).toBe("expired");
    expect(expired.title).toBe("登录已失效");
    expect(duplicate.kind).toBe("duplicate");
    expect(duplicate.description).toContain("服务端");
  });

  it("announces offline state persistently", () => {
    Object.defineProperty(window.navigator, "onLine", { configurable: true, value: false });
    render(
      <ThemeProvider>
        <CustomerRouteShell currentRoute="home"><p>主页内容</p></CustomerRouteShell>
      </ThemeProvider>,
    );
    expect(screen.getByText(/当前处于离线状态/).getAttribute("role")).toBe("status");
  });
});
