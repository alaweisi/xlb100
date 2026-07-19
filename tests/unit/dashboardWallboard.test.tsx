// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  operations: vi.fn(),
  requestCode: vi.fn(),
  login: vi.fn(),
}));

vi.mock("@xlb/api-client", () => ({
  createApiClient: vi.fn(() => ({})),
  createAuthApi: vi.fn(() => ({
    requestDashboardLoginCode: mocks.requestCode,
    dashboardLogin: mocks.login,
  })),
  createDashboardApi: vi.fn(() => ({ getOperations: mocks.operations })),
}));

import { App } from "../../apps/dashboard/src/App";

describe("总部实时运营大屏", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const data = url.includes("ready")
        ? { ok: true, mysql: "ok", redis: "ok" }
        : url.includes("system/status")
          ? { ok: true, apps: ["customer", "worker", "admin", "oa", "dashboard"] }
          : { status: "ok", service: "xlb-backend" };
      return { ok: true, status: 200, json: async () => data } as Response;
    }));
    mocks.operations.mockResolvedValue({
      ok: true,
      snapshot: {
        generatedAt: "2026-07-20T00:00:00.000Z",
        source: "mysql-readonly-aggregate",
        refreshAfterSeconds: 15,
        totals: {
          todayOrders: 18,
          activeOrders: 7,
          completedToday: 11,
          pendingDispatch: 3,
          openSupportTickets: 4,
          openAftersaleComplaints: 2,
        },
        cities: [{
          cityCode: "hangzhou",
          todayOrders: 18,
          activeOrders: 7,
          completedToday: 11,
          pendingDispatch: 3,
          openSupportTickets: 4,
          openAftersaleComplaints: 2,
        }],
      },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("未认证时只显示独立的大屏只读身份 Gate", () => {
    render(<App />);
    expect(screen.getByRole("heading", { name: "验证大屏访问身份" })).toBeTruthy();
    expect(screen.getByText("不复用 OA 或移动后台会话。", { exact: false })).toBeTruthy();
  });

  it("使用服务端只读聚合展示实时运营指标和城市分布", async () => {
    window.localStorage.setItem("xlb.dashboard.token", "dashboard-token");
    render(<App />);

    expect(await screen.findByRole("heading", { name: "喜乐帮运营态势" })).toBeTruthy();
    const metrics = screen.getByRole("region", { name: "实时运营指标" });
    expect(within(metrics).getByText("今日订单")).toBeTruthy();
    expect(within(metrics).getByText("18")).toBeTruthy();
    expect(within(metrics).getByText("待派单处理")).toBeTruthy();
    expect(screen.getByText("杭州")).toBeTruthy();
    expect(screen.getByText("15 秒刷新", { exact: false })).toBeTruthy();
    expect(mocks.operations).toHaveBeenCalledTimes(1);
  });
});
