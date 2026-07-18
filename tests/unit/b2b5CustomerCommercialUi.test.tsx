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
  it("只提交真实退款申请并展示服务端返回状态", async () => {
    const createRefundRequest = vi.fn().mockResolvedValue({
      refund: {
        refundId: "refund-real-1",
        cityCode: "hangzhou",
        orderId: "order-real-1",
        customerId: "customer-1",
        fulfillmentId: "fulfillment-1",
        paymentOrderId: "payment-1",
        amount: 88,
        currency: "CNY",
        reason: "服务未达到约定",
        status: "requested",
        requestedAt: "2026-07-18T12:00:00.000Z",
        approvedAt: null,
        approvedByAdminId: null,
      },
      idempotent: false,
    });
    const api = {
      createOrderReverseRequest: vi.fn(),
      listOrderReverseRequests: vi.fn().mockResolvedValue({ reverseRequests: [] }),
      createAftersaleComplaint: vi.fn(),
      listAftersaleComplaints: vi.fn().mockResolvedValue({ complaints: [] }),
      getOrderFulfillmentEvidence: vi.fn().mockResolvedValue({ aggregates: [] }),
      decideFulfillmentConfirmation: vi.fn(),
      createRefundRequest,
    };

    render(<CustomerAftersalePage api={api} orderIds={["order-real-1"]} />);
    await screen.findByText("暂无逆向申请");
    fireEvent.change(screen.getByLabelText("退款原因（选填）"), { target: { value: "服务未达到约定" } });
    fireEvent.click(screen.getByRole("button", { name: "提交退款申请" }));

    await waitFor(() => expect(createRefundRequest).toHaveBeenCalledWith({
      orderId: "order-real-1",
      reason: "服务未达到约定",
    }));
    expect((await screen.findAllByText(/refund-real-1/)).length).toBeGreaterThan(0);
    expect(screen.getByText("待处理")).toBeTruthy();
    expect(screen.queryByText("退款成功")).toBeNull();
    expect(screen.queryByText("已到账")).toBeNull();
  });
});
