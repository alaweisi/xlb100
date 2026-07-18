// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Fulfillment, WorkerTaskPoolItem } from "@xlb/types";
import { HallPage, TasksPage } from "../../apps/worker/src/pages/TaskPages";
import { TaskDetailPage } from "../../apps/worker/src/pages/FulfillmentPages";

const offer: WorkerTaskPoolItem = {
  dispatchTaskId: "dispatch-b1",
  cityCode: "hangzhou",
  orderId: "order-b1",
  skuId: "sku_home_daily_2h",
  amount: 168,
  streamName: "dispatch:hangzhou",
  status: "offering",
  createdAt: "2026-07-18T01:00:00.000Z",
};

const completed: Fulfillment = {
  fulfillmentId: "fulfillment-b1",
  acceptanceId: "acceptance-b1",
  dispatchTaskId: offer.dispatchTaskId,
  orderId: offer.orderId,
  cityCode: "hangzhou",
  workerId: "worker-b1",
  skuId: offer.skuId,
  status: "completed",
  startedAt: "2026-07-18T01:30:00.000Z",
  completedAt: "2026-07-18T02:30:00.000Z",
  completionNote: "现场服务完成",
  createdAt: "2026-07-18T01:01:00.000Z",
  updatedAt: "2026-07-18T02:30:00.000Z",
};

const hallBase = {
  tasks: [offer], loading: false, error: null, acceptError: null, acceptNotice: null,
  acceptingDispatchTaskId: null, simulationAction: null, simulationControlsEnabled: false,
  cityCode: "hangzhou", workerId: "worker-b1", onRefresh: vi.fn(), onAccept: vi.fn(),
  onReject: vi.fn(), onSimulateTimeout: vi.fn(),
};

afterEach(cleanup);

describe("B1 师傅端派单与履约生产界面", () => {
  it("以服务资格原因阻断派单邀约接受，并保留真实截止时间缺口", () => {
    render(<HallPage {...hallBase} eligibilityBySku={{ [offer.skuId]: { status: "blocked", reasons: ["缺少该服务所需资格"] } }} />);
    expect(screen.getByText("资格阻断")).toBeTruthy();
    expect(screen.getByText("缺少该服务所需资格")).toBeTruthy();
    expect(screen.getByText("倒计时 --:--")).toBeTruthy();
    expect((screen.getByRole("button", { name: "立即接单" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("本机暂停和网络离线均阻止接单且展示边界说明", () => {
    const onWorkModeChange = vi.fn();
    render(<HallPage {...hallBase} workMode="paused" networkOnline={false} onWorkModeChange={onWorkModeChange} />);
    expect(screen.getByText("当前网络已断开")).toBeTruthy();
    expect(screen.getByText(/平台在线状态切换接口尚未提供/)).toBeTruthy();
    expect((screen.getByRole("button", { name: "已暂停接单" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "在线" }));
    expect(onWorkModeChange).toHaveBeenCalledWith("online");
  });

  it("Supporting Frame 按进行中与已结束状态筛选", () => {
    const accepted = { ...completed, fulfillmentId: "fulfillment-accepted", status: "accepted" as const, completedAt: null };
    render(<TasksPage fulfillments={[accepted, completed]} loading={false} error={null} onRefresh={vi.fn()} onOpenDetail={vi.fn()} />);
    expect(screen.getByText(/履约单·\d{6}/)).toBeTruthy();
    expect(screen.queryByText("fulfillment-accepted")).toBeNull();
    expect(screen.queryByText("fulfillment-b1")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /已结束/ }));
    expect(screen.getByText(/履约单·\d{6}/)).toBeTruthy();
    expect(screen.queryByText("fulfillment-b1")).toBeNull();
    expect(screen.getByText(/打开查看顾客确认或争议结果/)).toBeTruthy();
  });

  it("完成态优先展示顾客争议，并冻结证据与诚实禁用取消", () => {
    render(<TaskDetailPage
      fulfillment={completed} loading={false} error={null} fulfillmentId={completed.fulfillmentId}
      lifecycleError={null} lifecycleNotice={null} lifecycleAction={null} evidenceLoading={false}
      evidenceError={null} evidenceBusy={false} onBack={vi.fn()} onStart={vi.fn()} onComplete={vi.fn()}
      onRefreshEvidence={vi.fn()} onUploadEvidence={vi.fn()} evidenceAggregate={{
        fulfillmentId: completed.fulfillmentId, orderId: completed.orderId, cityCode: "hangzhou",
        fulfillmentStatus: "completed", evidence: [], confirmation: {
          confirmationId: "confirmation-b1", cityCode: "hangzhou", fulfillmentId: completed.fulfillmentId,
          orderId: completed.orderId, customerId: "customer-b1", status: "disputed", complaintId: "complaint-b1",
          customerNote: "现场结果与约定不符", evidenceSnapshot: [], confirmedAt: null,
          disputedAt: "2026-07-18T03:00:00.000Z", createdAt: "2026-07-18T02:31:00.000Z", updatedAt: "2026-07-18T03:00:00.000Z",
        },
      }}
    />);
    expect(screen.getAllByText("顾客已发起争议").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("现场结果与约定不符")).toBeTruthy();
    expect(screen.getByText("投诉编号：complaint-b1")).toBeTruthy();
    expect((screen.getByRole("button", { name: "上传证据" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "取消履约（接口待接入）" }) as HTMLButtonElement).disabled).toBe(true);
  });
});
