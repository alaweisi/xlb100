// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";

const mocks = vi.hoisted(() => ({
  listDispatchBoard: vi.fn(),
  runDispatchMatch: vi.fn(),
  runDispatchTimeout: vi.fn(),
}));

vi.mock("../../apps/admin/src/adminAuth", () => ({ adminOpsApi: mocks }));

import { DispatchBoardPage } from "../../apps/admin/src/pages/DispatchBoardPage";

const row = (status: string, index: number) => ({
  dispatchTaskId: `dispatch-${index}`,
  orderId: `order-${index}`,
  skuId: `sku-${index}`,
  status,
  attemptCount: index,
  lastReason: status === "no_match" ? "no_candidate" : null,
  offer: index === 1 ? {
    offerId: "offer-1",
    workerId: "worker-1",
    status: "offering",
    distanceKm: 3.2,
    etaMinutes: 12,
    rankScore: 301,
    expiresAt: "2026-07-18T10:00:00.000Z",
    locationFreshness: "fresh",
    externalProviderExecuted: false,
  } : null,
});

describe("B1 后台派单看板", () => {
  beforeEach(() => {
    mocks.listDispatchBoard.mockReset();
    mocks.runDispatchMatch.mockReset();
    mocks.runDispatchTimeout.mockReset();
    mocks.listDispatchBoard.mockResolvedValue({ ok: true, rows: [
      row("queued", 1), row("pending", 2), row("offering", 3), row("accepted", 4),
      row("reassigning", 5), row("no_match", 6), row("manual_review", 7), row("timeout", 8),
      row("failed", 9), row("completed", 10), row("cancelled", 11),
    ] });
    mocks.runDispatchMatch.mockResolvedValue({ ok: true, processed: 1 });
    mocks.runDispatchTimeout.mockResolvedValue({ ok: true, processed: 2 });
  });

  afterEach(cleanup);

  it("聚合真实候选并把全部派单状态显示为中文", async () => {
    render(<DispatchBoardPage initialCityCode="hangzhou" />);
    expect((await screen.findAllByText("dispatch-1")).length).toBeGreaterThan(0);
    expect(screen.getByText("候选排序")).toBeTruthy();
    expect(screen.getByText("worker-1")).toBeTruthy();
    for (const label of ["待处理", "待匹配", "邀约中", "已接单", "重新派单", "暂无匹配", "人工复核", "已超时", "失败", "已完成", "已取消"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.queryByText("offering")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "重新匹配该任务" }));
    await waitFor(() => expect(mocks.runDispatchMatch).toHaveBeenCalledWith("dispatch-1"));
  });

  it("明确呈现 403 权限状态", async () => {
    mocks.listDispatchBoard.mockRejectedValue(new ApiClientError({ kind: "http", message: "forbidden", method: "GET", path: "/dispatch", status: 403 }));
    render(<DispatchBoardPage initialCityCode="hangzhou" />);
    expect(await screen.findByText("无权访问派单看板")).toBeTruthy();
    expect(screen.getByText(/系统未展示任何越权数据/)).toBeTruthy();
  });

  it("在写操作发生 409 时要求刷新而非模拟成功", async () => {
    mocks.runDispatchMatch.mockRejectedValue(new ApiClientError({ kind: "http", message: "conflict", method: "POST", path: "/dispatch", status: 409 }));
    render(<DispatchBoardPage initialCityCode="hangzhou" />);
    await screen.findAllByText("dispatch-1");
    fireEvent.click(screen.getByRole("button", { name: "重新匹配该任务" }));
    expect(await screen.findByText("数据已被其他操作更新")).toBeTruthy();
    expect(screen.queryByText(/已完成重试/)).toBeNull();
  });
});
