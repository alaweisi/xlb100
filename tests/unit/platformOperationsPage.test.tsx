// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import { PlatformOperationsPage } from "../../apps/admin/src/pages/PlatformOperationsPage";

const mocks = vi.hoisted(() => ({
  listOperationsOrders: vi.fn(), listOperationsSkus: vi.fn(), setOperationsSkuEnabled: vi.fn(),
  listWorkerCertifications: vi.fn(), approveWorkerCertification: vi.fn(), rejectWorkerCertification: vi.fn(),
}));
vi.mock("../../apps/admin/src/adminAuth", () => ({ adminOpsApi: mocks }));

const order = { orderId: "order-1", cityCode: "hangzhou", customerId: "customer-1", skuId: "sku-1", skuName: "家庭保洁", status: "pending_dispatch", totalAmount: 89, scheduledAt: "2026-07-11T01:00:00.000Z", createdAt: "2026-07-10T01:00:00.000Z" };
const sku = { skuId: "sku-1", cityCode: "hangzhou", categoryName: "家政", itemName: "保洁", skuName: "家庭保洁", unit: "次", isEnabled: true, basePrice: 89, priceType: "fixed", warrantyDays: 7, supportsEnterprise: true };
const certification = { certificationId: "cert-1", workerId: "worker-1", cityCode: "hangzhou", certType: "basic", certName: "基础服务认证", status: "pending", submittedAt: "2026-07-10T00:00:00.000Z", reviewedAt: null, reviewerId: null, rejectReason: null, createdAt: "2026-07-10T00:00:00.000Z", updatedAt: "2026-07-10T00:00:00.000Z" };

describe("B1 后台平台运营页", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.listOperationsOrders.mockResolvedValue({ ok: true, orders: [order] });
    mocks.listOperationsSkus.mockResolvedValue({ ok: true, skus: [sku] });
    mocks.listWorkerCertifications.mockResolvedValue({ ok: true, certifications: [certification] });
    mocks.setOperationsSkuEnabled.mockResolvedValue({ ok: true, sku: { skuId: "sku-1", isEnabled: false } });
    mocks.approveWorkerCertification.mockResolvedValue({ ok: true, certification: { ...certification, status: "approved" } });
    mocks.rejectWorkerCertification.mockResolvedValue({ ok: true, certification: { ...certification, status: "rejected" } });
  });

  afterEach(cleanup);

  it("加载真实联动记录并调用现有目录与认证写接口", async () => {
    render(<PlatformOperationsPage initialCityCode="hangzhou" />);
    expect(await screen.findByText("order-1")).toBeTruthy();
    expect(screen.getAllByText("家庭保洁").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "停用服务" }));
    await waitFor(() => expect(mocks.setOperationsSkuEnabled).toHaveBeenCalledWith("sku-1", false));
    fireEvent.click(screen.getByRole("button", { name: "通过" }));
    await waitFor(() => expect(mocks.approveWorkerCertification).toHaveBeenCalledWith("cert-1"));
  });

  it("认证驳回必须填写真实原因", async () => {
    render(<PlatformOperationsPage initialCityCode="hangzhou" />);
    await screen.findByText("cert-1");
    const rejectButton = screen.getByRole("button", { name: "驳回" });
    expect((rejectButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("驳回原因 cert-1"), { target: { value: "资质文件已过期" } });
    fireEvent.click(rejectButton);
    await waitFor(() => expect(mocks.rejectWorkerCertification).toHaveBeenCalledWith("cert-1", "资质文件已过期"));
  });

  it("单个分区 403 时保留其余接口的真实结果", async () => {
    mocks.listOperationsSkus.mockRejectedValue(new ApiClientError({ kind: "http", message: "forbidden", method: "GET", path: "/skus", status: 403 }));
    render(<PlatformOperationsPage initialCityCode="hangzhou" />);
    expect(await screen.findByText((_, element) => (
      element?.getAttribute("role") === "status"
      && Boolean(element.textContent?.includes("部分结果：服务目录（无权访问服务目录）"))
    ))).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();
    expect(screen.getByText("cert-1")).toBeTruthy();
    expect(screen.getByText("目录数据未能读取")).toBeTruthy();
  });

  it("目录写入 409 时不显示成功提示", async () => {
    mocks.setOperationsSkuEnabled.mockRejectedValue(new ApiClientError({ kind: "http", message: "conflict", method: "POST", path: "/skus", status: 409 }));
    render(<PlatformOperationsPage initialCityCode="hangzhou" />);
    await screen.findByText("order-1");
    fireEvent.click(screen.getByRole("button", { name: "停用服务" }));
    expect(await screen.findByText("数据已被其他操作更新")).toBeTruthy();
    expect(screen.queryByText("服务 家庭保洁 已停用。")).toBeNull();
  });
});
