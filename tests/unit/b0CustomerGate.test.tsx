// @vitest-environment jsdom
import React, { Suspense } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requestCode: vi.fn(),
  login: vi.fn(),
  getCatalog: vi.fn(),
  listOrders: vi.fn(),
}));

vi.mock("@xlb/api-client", () => ({
  createApiClient: vi.fn(() => ({})),
  createAuthApi: vi.fn(() => ({
    requestCustomerLoginCode: mocks.requestCode,
    customerLogin: mocks.login,
  })),
  customerApi: { forClient: vi.fn(() => ({ getCatalog: mocks.getCatalog, listOrders: mocks.listOrders })) },
}));

import { App } from "../../apps/customer/src/app/App";

describe("B0 顾客身份 Gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState({}, "", "/customer/orders");
    mocks.requestCode.mockResolvedValue({ ok: true, ttlSeconds: 300, expiresAt: "2026-07-17T10:00:00.000Z", attemptsLeft: 5 });
    mocks.login.mockResolvedValue({ ok: true, token: "customer-token", userId: "customer-1", role: "customer" });
    mocks.getCatalog.mockResolvedValue({ ok: true, catalog: { cityCode: "hangzhou", categories: [], generatedAt: "2026-07-17T09:00:00.000Z" } });
    mocks.listOrders.mockResolvedValue({ orders: [], nextCursor: null });
  });

  afterEach(cleanup);

  it("保留原目标并通过真实验证码动作建立持久会话", async () => {
    render(<Suspense fallback={<div>正在恢复目标画面</div>}><App /></Suspense>);
    expect(await screen.findByText("顾客登录", undefined, { timeout: 15_000 })).toBeTruthy();
    expect(window.location.pathname).toBe("/customer/orders");

    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800000001" } });
    fireEvent.click(screen.getByRole("button", { name: "获取验证码" }));
    expect(await screen.findByText("验证码已发送，5 分钟内有效。")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录并继续" }));

    await waitFor(() => expect(mocks.login).toHaveBeenCalledWith("13800000001", "123456"));
    expect(window.localStorage.getItem("xlb.customer.token")).toBe("customer-token");
    expect(window.location.pathname).toBe("/customer/orders");
    await waitFor(() => expect(screen.queryByText("顾客登录")).toBeNull());
  }, 20_000);
});
