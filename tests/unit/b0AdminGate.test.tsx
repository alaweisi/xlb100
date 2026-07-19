// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const mocks = vi.hoisted(() => ({
  requestCode: vi.fn(),
  login: vi.fn(),
}));

vi.mock("../../apps/admin/src/adminAuth", () => ({
  clearAdminSession: vi.fn(),
  readStoredAdminSession: vi.fn(() => null),
  requestAdminLoginCode: mocks.requestCode,
  loginAdminWithCode: mocks.login,
  adminOpsApi: {},
}));

import { App } from "../../apps/admin/src/app/App";

describe("B0 运营应用身份与城市 Gate", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.location.hash = "#/order-trace";
    mocks.requestCode.mockResolvedValue({ ok: true });
    mocks.login.mockResolvedValue({ token: "admin-token", userId: "admin-1", role: "operator", username: "admin_hz" });
  });

  afterEach(cleanup);

  it("认证后进入城市范围 Gate，并保留原工作台", async () => {
    render(<App />);
    expect(await screen.findByText("运营身份验证")).toBeTruthy();
    expect(screen.getByText("目标工作台：订单追踪")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("选择运营城市")).toBeTruthy();
    expect(screen.getByText("确认后返回：订单追踪")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "进入该城市工作台" }));
    await waitFor(() => expect(window.localStorage.getItem("xlb.admin.cityCode")).toBe("hangzhou"));
  });

  it("OA 使用独立总部会话与城市选择存储", async () => {
    mocks.login.mockResolvedValue({ token: "oa-token", userId: "oa-1", role: "admin", username: "oa_global" });
    render(<App surface="oa" />);

    expect(await screen.findByText("OA 总后台身份验证")).toBeTruthy();
    expect(screen.getByText(/OA 会话与移动后台完全隔离/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText("短信验证码"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "登录" }));

    expect(await screen.findByText("选择 OA 工作范围")).toBeTruthy();
    expect(mocks.login).toHaveBeenCalledWith("oa_global", "654321", "oa");
    fireEvent.click(screen.getByRole("button", { name: "进入该城市工作台" }));
    await waitFor(() => expect(window.localStorage.getItem("xlb.oa.cityCode")).toBe("hangzhou"));
    expect(window.localStorage.getItem("xlb.admin.cityCode")).toBeNull();
  });
});
