// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  buildCustomerDeepLink,
  replaceCustomerDeepLink,
  type CustomerDeepLinkTarget,
} from "../../apps/customer/src/routes/customerDeepLinks";

describe("Customer cross-route deep links", () => {
  it("keeps the selected city and encodes discovery context", () => {
    expect(buildCustomerDeepLink("services", {
      cityCode: "hangzhou",
      q: " 空调 清洗 ",
      categoryId: "category/cleaning",
      skuId: "sku:air conditioner",
    })).toBe(
      "/customer/services?cityCode=hangzhou&q=%E7%A9%BA%E8%B0%83+%E6%B8%85%E6%B4%97&categoryId=category%2Fcleaning&skuId=sku%3Aair+conditioner",
    );
  });

  it("allows only destination-owned parameters", () => {
    const href = buildCustomerDeepLink("createOrder", {
      cityCode: "hangzhou",
      skuId: "sku-01",
      couponGrantId: "grant-01",
      orderId: "stale-order",
      complaintId: "stale-complaint",
      q: "stale-search",
    });

    expect(href).toBe(
      "/customer/order/create?cityCode=hangzhou&skuId=sku-01&couponGrantId=grant-01",
    );
    expect(href).not.toContain("stale-");
  });

  it("strips create-order context after authoritative order creation", () => {
    expect(buildCustomerDeepLink("orders", {
      cityCode: "hangzhou",
      orderId: "order-01",
      skuId: "sku-01",
      couponGrantId: "grant-01",
    })).toBe("/customer/orders?cityCode=hangzhou&orderId=order-01");
  });

  it("preserves the complete aftersale-to-support recovery context", () => {
    expect(buildCustomerDeepLink("support", {
      cityCode: "hangzhou",
      orderId: "order/01",
      complaintId: "complaint 01",
    })).toBe(
      "/customer/support?cityCode=hangzhou&orderId=order%2F01&complaintId=complaint+01",
    );
  });

  it("omits blank optional values", () => {
    expect(buildCustomerDeepLink("services", {
      cityCode: "hangzhou",
      q: "   ",
      categoryId: null,
      skuId: "",
    })).toBe("/customer/services?cityCode=hangzhou");
  });

  it("makes every customer destination city-scoped", () => {
    const targets: CustomerDeepLinkTarget[] = [
      "home",
      "services",
      "createOrder",
      "orders",
      "aftersale",
      "support",
      "notifications",
      "coupons",
      "profile",
    ];

    for (const target of targets) {
      const href = buildCustomerDeepLink(target, { cityCode: "hangzhou" });
      expect(href).toMatch(/^\/customer\//);
      expect(new URL(href, "https://customer.xlb.test").searchParams.getAll("cityCode"))
        .toEqual(["hangzhou"]);
    }
  });

  it("replaces stale source search state during same-document recovery", () => {
    window.history.replaceState(
      {},
      "",
      "/customer/order/create?cityCode=hangzhou&skuId=sku-01&couponGrantId=grant-01",
    );

    replaceCustomerDeepLink("orders", { cityCode: "hangzhou", orderId: "order-01" });

    expect(`${window.location.pathname}${window.location.search}`).toBe(
      "/customer/orders?cityCode=hangzhou&orderId=order-01",
    );
  });
});
