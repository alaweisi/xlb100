// @vitest-environment jsdom
import React from "react";
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const apiMocks = vi.hoisted(() => ({
  getCatalog: vi.fn(),
  listCouponGrants: vi.fn(),
}));

vi.mock("../../apps/customer/src/pages/customerPageShell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/customer/src/pages/customerPageShell")>();
  return {
    ...actual,
    createCustomerApiClient: () => ({
      getCatalog: apiMocks.getCatalog,
      listCouponGrants: apiMocks.listCouponGrants,
      getPriceQuote: vi.fn(),
      createOrder: vi.fn(),
      getOrder: vi.fn(),
      issueDiscountDecision: vi.fn(),
    }),
  };
});

import { App } from "../../apps/customer/src/app/App";

beforeEach(() => {
  apiMocks.getCatalog.mockReset().mockResolvedValue({
    catalog: { cityCode: "hangzhou", categories: [] },
  });
  apiMocks.listCouponGrants.mockReset().mockResolvedValue({
    ok: true,
    couponGrants: [],
  });
  window.localStorage.clear();
  window.localStorage.setItem("xlb.customer.token", "customer-test-token");
  window.localStorage.setItem("xlb.customer.userId", "customer-test-id");
  window.history.replaceState({}, "", "/customer/order/create");
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

describe("Customer App API adapter stability", () => {
  it("does not restart the coupon GET when parent catalog state rerenders", async () => {
    render(<App />);

    await waitFor(() => expect(apiMocks.getCatalog).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiMocks.listCouponGrants).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(apiMocks.listCouponGrants).toHaveBeenCalledTimes(1);
  });
});
