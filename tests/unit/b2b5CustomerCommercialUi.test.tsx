// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerAftersalePage } from "../../apps/customer/src/pages/CustomerAftersalePage";

beforeEach(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
});

afterEach(cleanup);

describe("B2 顾客售后商业链路", () => {
  it("只提交真实订单变更申请并展示服务端返回状态", async () => {
    const reverseRequest = {
        reverseRequestId: "reverse-real-1",
        cityCode: "hangzhou",
        orderId: "order-real-1",
        customerId: "customer-1",
        reverseType: "cancel" as const,
        status: "requested" as const,
        reason: "服务未达到约定",
        requestedScheduledAt: null,
        requestedTimeSlot: null,
        idempotencyKey: "reverse-real-key-1",
        reviewNote: null,
        reviewedByAdminId: null,
        reviewedAt: null,
        appliedAt: null,
        createdAt: "2026-07-18T12:00:00.000Z",
        updatedAt: "2026-07-18T12:00:00.000Z",
    };
    const createOrderReverseRequest = vi.fn().mockResolvedValue({ reverseRequest });
    const api = {
      createOrderReverseRequest,
      listOrderReverseRequests: vi.fn().mockResolvedValue({ reverseRequests: [] }),
      createAftersaleComplaint: vi.fn(),
      listAftersaleComplaints: vi.fn().mockResolvedValue({ complaints: [] }),
      getOrderFulfillmentEvidence: vi.fn().mockResolvedValue({ aggregates: [] }),
      decideFulfillmentConfirmation: vi.fn(),
    };

    render(<CustomerAftersalePage api={api} cityCode="hangzhou" orderIds={["order-real-1"]} />);
    await screen.findByText("暂无变更申请");
    fireEvent.change(screen.getByLabelText("申请原因"), { target: { value: "服务未达到约定" } });
    fireEvent.click(screen.getByRole("button", { name: "提交变更申请" }));

    await waitFor(() => expect(createOrderReverseRequest).toHaveBeenCalledWith("order-real-1", {
      reverseType: "cancel",
      reason: "服务未达到约定",
      idempotencyKey: expect.stringMatching(/^customer-reverse-/),
    }));
    expect(await screen.findByText("申请已由平台受理")).toBeTruthy();
    expect(screen.getByText(/服务记录号：reverse-real-1/)).toBeTruthy();
    expect(screen.queryByText("已取消")).toBeNull();
  });
});
