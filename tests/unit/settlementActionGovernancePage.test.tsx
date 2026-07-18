// @vitest-environment jsdom
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SettlementActionGovernancePage } from "@xlb/admin-pages/SettlementActionGovernancePage";

const { mockGet, mockPost } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPost: vi.fn() }));
vi.mock("@xlb/api-client", () => ({
  createApiClient: () => ({ get: mockGet, post: mockPost }),
  createAuthApi: () => ({ requestAdminLoginCode: vi.fn(), getAdminDebugCode: vi.fn(), adminLogin: vi.fn() }),
  adminApi: { create: () => ({}) },
  settlementApi: { create: () => ({}) },
  governancePlannerApi: { create: () => ({
    listSettlementDryRunPlans: (query: unknown) => mockGet("listSettlementDryRunPlans", query),
    createSettlementDryRunPlan: (packetId: string) => mockPost("createSettlementDryRunPlan", packetId),
    getSettlementDryRunPlan: vi.fn(), getSettlementDryRunPlanItems: vi.fn(), getSettlementDryRunPlanAudit: vi.fn(), getReadinessPacketDryRunEligibility: vi.fn(),
  }) },
}));

describe("结算动作治理工作台", () => {
  beforeEach(() => {
    mockGet.mockReset(); mockPost.mockReset();
    mockGet.mockResolvedValue({ ok: true, plans: [] });
    mockPost.mockResolvedValue({ ok: true, plan: {} });
    window.location.hash = "";
  });

  it("明确展示全部禁用的执行边界", () => {
    render(<SettlementActionGovernancePage onBack={vi.fn()} />);
    expect(screen.getByText("结算动作治理")).toBeTruthy();
    expect(screen.getByText("执行边界")).toBeTruthy();
    expect(screen.getAllByText("已禁用").length).toBe(7);
    for (const label of ["出款", "退款", "账本冲正", "提交结算", "生成导出文件", "批准并执行"]) {
      expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("没有真实就绪包编号时不能生成计划", () => {
    render(<SettlementActionGovernancePage onBack={vi.fn()} />);
    expect((screen.getByRole("button", { name: "生成只读计划" }) as HTMLButtonElement).disabled).toBe(true);
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("把人工输入的就绪包编号原样提交给计划接口", async () => {
    render(<SettlementActionGovernancePage onBack={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText("输入真实就绪包编号"), { target: { value: "packet-real-1" } });
    fireEvent.click(screen.getByRole("button", { name: "生成只读计划" }));
    await waitFor(() => expect(mockPost).toHaveBeenCalledWith("createSettlementDryRunPlan", "packet-real-1"));
  });

  it("只读计划列表按服务端结果展示", async () => {
    mockGet.mockResolvedValue({ ok: true, plans: [{ planId: "p1", planHash: "abc123", status: "draft", packetId: "pkt1", cityCode: "hangzhou", itemCount: 5, createdAt: "2025-01-01T00:00:00Z", updatedAt: "2025-01-01T00:00:00Z" }] });
    render(<SettlementActionGovernancePage onBack={vi.fn()} subView="plans" />);
    expect(await screen.findByText("abc123")).toBeTruthy();
    expect(screen.getByText("草稿")).toBeTruthy();
    expect(screen.getByText("pkt1")).toBeTruthy();
  });

  it("空列表诚实展示空态", async () => {
    render(<SettlementActionGovernancePage onBack={vi.fn()} subView="plans" />);
    expect(await screen.findByText("当前城市没有只读计划")).toBeTruthy();
  });

  it("返回按钮只触发调用方导航", () => {
    const onBack = vi.fn();
    render(<SettlementActionGovernancePage onBack={onBack} />);
    fireEvent.click(screen.getByRole("button", { name: "返回结算运营台" }));
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(mockPost).not.toHaveBeenCalled();
  });
});
