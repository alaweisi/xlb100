// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  clear: vi.fn(),
  summary: vi.fn(),
  gaps: vi.fn(),
  session: { token: "admin-token", userId: "admin-1", role: "operator", username: "admin_hz" },
}));

vi.mock("../../apps/admin/src/adminAuth", () => ({
  clearAdminSession: auth.clear,
  loginAdminWithCode: vi.fn(),
  readStoredAdminSession: vi.fn(() => auth.session),
  requestAdminLoginCode: vi.fn(),
  adminOpsApi: { marketing: {} },
  adminSettlementApi: {
    getReviewSummary: auth.summary,
    scanReconciliationGaps: auth.gaps,
  },
  adminOrderTraceApi: {},
}));

import { App } from "../../apps/admin/src/app/App";

describe("后台手机运营 App 外壳", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.localStorage.setItem("xlb.admin.cityCode", "hangzhou");
    window.location.hash = "";
    auth.session = { token: "admin-token", userId: "admin-1", role: "operator", username: "admin_hz" };
    auth.summary.mockResolvedValue({ overall: { totalStatements: 4, reviewedStatements: 3, approvedStatements: 2 } });
    auth.gaps.mockResolvedValue({ summary: { totalGaps: 1 } });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("使用五项底部主导航且不再渲染桌面侧栏", async () => {
    const { container } = render(<App />);
    expect(await screen.findByRole("heading", { name: "运营总览", level: 1 })).toBeTruthy();
    expect(container.querySelector("aside")).toBeNull();

    const navigation = screen.getByRole("navigation", { name: "运营应用主导航" });
    for (const label of ["总览", "订单派单", "客服", "审批", "我的/更多"]) {
      expect(within(navigation).getByRole("button", { name: label })).toBeTruthy();
    }
  });

  it("从我的更多打开包含十四个工作台的全部工具面板", async () => {
    render(<App />);
    await screen.findByRole("heading", { name: "运营总览", level: 1 });
    fireEvent.click(screen.getByRole("button", { name: "我的/更多" }));

    const dialog = screen.getByRole("dialog", { name: "全部工作台" });
    const labels = [
      "结算运营", "结算单详情", "导出复核", "结算治理", "订单追踪", "师傅提现", "售后运营",
      "企业客户", "城市派单", "平台运营", "客服工作台", "客服质量", "评价与口碑", "营销优惠券",
    ];
    for (const label of labels) expect(within(dialog).getByRole("button", { name: new RegExp(label) })).toBeTruthy();
    expect(labels).toHaveLength(14);
  });

  it("详情工作台显示返回入口与移动标题", async () => {
    window.location.hash = "#/order-trace?cityCode=hangzhou";
    render(<App />);
    expect(await screen.findByRole("heading", { name: "订单追踪", level: 1 })).toBeTruthy();
    expect(screen.getByRole("button", { name: "返回运营总览" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "返回运营总览" }));
    await waitFor(() => expect(window.location.hash).toBe(""));
  });

  it("未知角色仍在移动全屏门禁中拒绝访问", async () => {
    auth.session = { ...auth.session, role: "customer" };
    const { container } = render(<App />);
    expect(await screen.findByText("当前角色无权进入后台")).toBeTruthy();
    expect(container.querySelector(".admin-mobile-gate--permission")).toBeTruthy();
    expect(container.querySelector(".admin-mobile-shell")).toBeNull();
  });

  it("审计人员仍不能进入派单工作台", async () => {
    auth.session = { ...auth.session, role: "auditor" };
    window.location.hash = "#/dispatch?cityCode=hangzhou";
    const { container } = render(<App />);
    expect(await screen.findByText("无权进入派单工作台")).toBeTruthy();
    expect(container.querySelector(".admin-mobile-gate--permission")).toBeTruthy();
  });
});
