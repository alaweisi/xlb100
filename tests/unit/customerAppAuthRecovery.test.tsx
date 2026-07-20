// @vitest-environment jsdom
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiClientError } from "../../packages/api-client/src/createApiClient";

let notifyUnauthorized: ((error: ApiClientError) => void) | undefined;

vi.mock("../../apps/customer/src/pages/customerPageShell", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../apps/customer/src/pages/customerPageShell")>();
  return {
    ...actual,
    createCustomerApiClient: (
      _cityCode: string,
      _token?: string,
      onUnauthorized?: (error: ApiClientError) => void,
    ) => {
      notifyUnauthorized = onUnauthorized;
      return {
        getCatalog: vi.fn().mockResolvedValue({ catalog: { cityCode: "hangzhou", categories: [] } }),
        getProfile: vi.fn().mockResolvedValue({
          ok: true,
          profile: { customerId: "customer-123", name: "Customer", phoneMasked: "138****8000", defaultCityCode: "hangzhou" },
        }),
        listAddresses: vi.fn().mockResolvedValue({ ok: true, addresses: [] }),
      };
    },
  };
});

import { App } from "../../apps/customer/src/app/App";

beforeEach(() => {
  notifyUnauthorized = undefined;
  window.localStorage.clear();
  window.localStorage.setItem("xlb.customer.token", "customer-test-token");
  window.localStorage.setItem("xlb.customer.userId", "customer-123");
  window.localStorage.setItem("xlb.customer.orderIds", JSON.stringify(["order-private"]));
  window.history.replaceState({}, "", "/customer/profile");
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

describe("Customer App authentication recovery", () => {
  it("clears the session and account history when any authenticated API returns 401", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "账号资料" });
    expect(notifyUnauthorized).toBeTypeOf("function");

    act(() => notifyUnauthorized?.({ status: 401 } as ApiClientError));

    await screen.findByRole("heading", { name: "顾客登录" });
    expect(screen.getByText("登录状态已失效，请重新登录。")).not.toBeNull();
    expect(window.localStorage.getItem("xlb.customer.token")).toBeNull();
    expect(window.localStorage.getItem("xlb.customer.userId")).toBeNull();
    expect(window.localStorage.getItem("xlb.customer.orderIds")).toBeNull();
  });

  it("provides an explicit logout action that removes the local bearer session", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "账号资料" });

    fireEvent.click(screen.getByRole("button", { name: "退出登录" }));

    await screen.findByRole("heading", { name: "顾客登录" });
    expect(screen.queryByText(/session expired/iu)).toBeNull();
    expect(window.localStorage.getItem("xlb.customer.token")).toBeNull();
  });
});
