// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RepairOrdersPage } from "../../apps/worker/src/pages/FulfillmentPages";
import { WalletPage } from "../../apps/worker/src/pages/FinancePages";
import { CertificationPage, WorkerLocationPage } from "../../apps/worker/src/pages/ProfilePages";
import { WorkerNotificationsPage } from "../../apps/worker/src/pages/WorkerNotificationsPage";
import { formatWorkerApiError } from "../../apps/worker/src/app/workerFeedback";

afterEach(cleanup);
beforeEach(() => Object.defineProperty(window.navigator, "onLine", { configurable: true, value: true }));

describe("师傅端 B2～B4 商业化页面", () => {
  it("展示返工全生命周期，并只开放当前状态允许的动作", () => {
    const onStart = vi.fn();
    render(<RepairOrdersPage
      repairOrders={[
        { repairOrderId: "repair-requested", complaintId: "complaint-1", orderId: "order-1", workerId: "worker-1", reason: "等待分派", serviceNote: null, status: "requested", startedAt: null, completedAt: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" },
        { repairOrderId: "repair-assigned", complaintId: "complaint-2", orderId: "order-2", workerId: "worker-1", reason: "重新服务", serviceNote: null, status: "assigned", startedAt: null, completedAt: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" },
        { repairOrderId: "repair-cancelled", complaintId: "complaint-3", orderId: "order-3", workerId: "worker-1", reason: "平台取消", serviceNote: null, status: "cancelled", startedAt: null, completedAt: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" },
      ] as never}
      loading={false} error={null} busyId={null} notes={{}} onRefresh={vi.fn()} onNoteChange={vi.fn()}
      onStart={onStart} onComplete={vi.fn()}
    />);
    expect(screen.getByText("待平台分派")).toBeTruthy();
    expect(screen.getByText("已取消")).toBeTruthy();
    const startButtons = screen.getAllByRole("button", { name: "开始返工" });
    expect(startButtons.filter((button) => !(button as HTMLButtonElement).disabled)).toHaveLength(1);
    fireEvent.click(startButtons.find((button) => !(button as HTMLButtonElement).disabled)!);
    expect(onStart).toHaveBeenCalledWith("repair-assigned");
  });

  it("兼容旧返工记录缺少投诉编号", () => {
    render(<RepairOrdersPage
      repairOrders={[{ repairOrderId: "repair-legacy", complaintId: undefined, orderId: "order-legacy", workerId: "worker-legacy", reason: "历史记录", serviceNote: null, status: "assigned", startedAt: null, completedAt: null, createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" } as never]}
      loading={false} error={null} busyId={null} notes={{}} onRefresh={vi.fn()} onNoteChange={vi.fn()}
      onStart={vi.fn()} onComplete={vi.fn()}
    />);
    expect(screen.getByText("投诉·暂无")).toBeTruthy();
  });

  it("钱包诚实展示部分加载和提现边界，不声称已打款", () => {
    render(<WalletPage balance={{ availableAmount: 80, accruedAmount: 120, adjustedAmount: 0, requestedWithdrawalAmount: 40, markedPaidAmount: 0 } as never}
      bankAccounts={[]} withdrawals={[]} busy={false} error="钱包数据仅部分加载：提现记录暂不可用。" notice={null}
      accountHolder="" bankName="" bankCardNumber="" withdrawalAmount="100" selectedBankAccountId=""
      onReload={vi.fn()} onAccountHolderChange={vi.fn()} onBankNameChange={vi.fn()} onBankCardNumberChange={vi.fn()}
      onWithdrawalAmountChange={vi.fn()} onSelectedBankAccountChange={vi.fn()} onAddBankAccount={vi.fn()} onRequestWithdrawal={vi.fn()} />);
    expect(screen.getByText(/仅部分加载/)).toBeTruthy();
    expect(screen.getByText(/提交后进入审核流程，不代表已结算、已打款或已到账/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "提交提现申请" })).toHaveProperty("disabled", true);
  });

  it("离线时关闭位置写入，认证仅展示真实待审核回执", () => {
    const { rerender } = render(<WorkerLocationPage location={null} busy={false} error={null} networkOnline={false}
      latitude="30" longitude="120" radius="10" sharing onLatitudeChange={vi.fn()} onLongitudeChange={vi.fn()}
      onRadiusChange={vi.fn()} onSharingChange={vi.fn()} onSave={vi.fn()} onReload={vi.fn()} />);
    expect(screen.getByText("当前网络已断开")).toBeTruthy();
    expect(screen.getByRole("button", { name: "更新当前位置" })).toHaveProperty("disabled", true);
    rerender(<CertificationPage cityCode="hangzhou" workerId="worker-1" certType="basic" certName="基础资格" submitting={false}
      error={null} notice="申请已提交" receipt={{ certificationId: "cert-1", workerId: "worker-1", cityCode: "hangzhou", certType: "basic", certName: "基础资格", status: "pending", submittedAt: "2026-07-18T00:00:00.000Z", createdAt: "2026-07-18T00:00:00.000Z", updatedAt: "2026-07-18T00:00:00.000Z" }}
      onCertTypeChange={vi.fn()} onCertNameChange={vi.fn()} onSubmit={vi.fn()} />);
    expect(screen.getAllByText("待审核").length).toBeGreaterThan(0);
    expect(screen.getByText(/认证申请·\d{6}/)).toBeTruthy();
    expect(screen.getByText(/师傅编号·\d{6}/)).toBeTruthy();
    expect(screen.queryByText("cert-1")).toBeNull();
    expect(screen.queryByText("worker-1")).toBeNull();
    expect(screen.getByText(/不会伪造“已通过”/)).toBeTruthy();
  });

  it("通知重复变更返回已安全处理，并重新读取权威状态", async () => {
    const item = { notificationId: "notice-1", eventType: "order.created", templateRevisionId: "template-1", title: "新任务通知", body: "请查看新任务", reference: { kind: "order_created", orderId: "order-1" }, occurredAt: "2026-07-18T00:00:00.000Z", createdAt: "2026-07-18T00:00:00.000Z", readAt: null, archivedAt: null, rowVersion: 1 } as const;
    const listNotifications = vi.fn().mockResolvedValue({ ok: true, items: [item], nextCursor: null });
    render(<WorkerNotificationsPage api={{ listNotifications, markNotificationRead: vi.fn().mockResolvedValue({ ok: true, result: { outcome: "already_applied", rowVersion: 2 } }), setNotificationArchived: vi.fn() }} />);
    fireEvent.click(await screen.findByRole("button", { name: "标记已读" }));
    expect(await screen.findByText("重复操作已安全处理，该消息此前已读。")).toBeTruthy();
    await waitFor(() => expect(listNotifications).toHaveBeenCalledTimes(2));
  });

  it("统一覆盖权限、冲突和未知结果反馈", () => {
    expect(formatWorkerApiError(new Error("请求失败 403"), "失败")).toContain("账号权限");
    expect(formatWorkerApiError(new Error("请求失败 409"), "失败", "mutation")).toContain("业务状态");
    expect(formatWorkerApiError(new Error("请求失败 503"), "失败", "mutation")).toContain("结果暂时未知");
  });
});
