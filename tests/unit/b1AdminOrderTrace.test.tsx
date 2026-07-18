// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";

const mocks = vi.hoisted(() => ({
  getOrderTrace: vi.fn(),
  getOrderFulfillmentEvidence: vi.fn(),
}));

vi.mock("../../apps/admin/src/adminAuth", () => ({ adminOrderTraceApi: mocks }));

import { OrderTracePage } from "../../apps/admin/src/pages/OrderTracePage";

const trace = {
  order: { orderId: "order-1", cityCode: "hangzhou", customerId: "customer-1", skuId: "sku-1", skuName: "家庭保洁", status: "pending_dispatch", totalAmount: 89, currency: "CNY", createdAt: "2026-07-18T01:00:00.000Z" },
  pricing: null,
  payment: { paymentOrderId: "payment-1", status: "paid", amount: 89, currency: "CNY", provider: "payment-provider", updatedAt: "2026-07-18T01:10:00.000Z" },
  dispatch: { dispatchTaskId: "dispatch-1", status: "no_match", customerMessage: "no_candidate", updatedAt: "2026-07-18T01:20:00.000Z", timeline: [{ dispatchEventId: "event-1", eventType: "no_match", workerId: null, reason: "no_candidate", createdAt: "2026-07-18T01:20:00.000Z" }] },
  fulfillment: null,
  review: null,
  aftersale: null,
  phase17Aftersale: { reverseRequests: [], complaints: [], timeline: [] },
};

describe("B1 后台订单追踪", () => {
  beforeEach(() => {
    mocks.getOrderTrace.mockReset();
    mocks.getOrderFulfillmentEvidence.mockReset();
    mocks.getOrderTrace.mockResolvedValue({ ok: true, trace });
    mocks.getOrderFulfillmentEvidence.mockResolvedValue({ ok: true, aggregates: [] });
    window.location.hash = "#/order-trace?cityCode=hangzhou&orderId=order-1";
  });

  afterEach(cleanup);

  it("以中文呈现订单、支付和派单链路", async () => {
    render(<OrderTracePage initialCityCode="hangzhou" initialOrderId="order-1" />);
    expect(await screen.findByText("业务阶段")).toBeTruthy();
    expect(screen.getAllByText("待派单").length).toBeGreaterThan(0);
    expect(screen.getAllByText("已支付").length).toBeGreaterThan(0);
    expect(screen.getAllByText("暂无匹配").length).toBeGreaterThan(0);
    expect(screen.getAllByText("当前没有符合范围与资质要求的候选师傅").length).toBeGreaterThan(0);
    expect(screen.queryByText("pending_dispatch")).toBeNull();
    expect(screen.queryByText("no_match")).toBeNull();
  });

  it("凭证接口失败时保留订单主链并标记部分结果", async () => {
    mocks.getOrderFulfillmentEvidence.mockRejectedValue(new ApiClientError({ kind: "timeout", message: "timeout", method: "GET", path: "/evidence" }));
    render(<OrderTracePage initialCityCode="hangzhou" initialOrderId="order-1" />);
    expect(await screen.findByText(/部分结果：订单主链路已成功读取/)).toBeTruthy();
    expect(screen.getAllByText("order-1").length).toBeGreaterThan(0);
    expect(screen.getByText("履约凭证未能读取")).toBeTruthy();
  });

  it("订单接口返回 403 时不展示业务详情", async () => {
    mocks.getOrderTrace.mockRejectedValue(new ApiClientError({ kind: "http", message: "forbidden", method: "GET", path: "/trace", status: 403 }));
    render(<OrderTracePage initialCityCode="hangzhou" initialOrderId="order-1" />);
    expect(await screen.findByText("无权访问订单追踪")).toBeTruthy();
    expect(screen.queryByText("业务阶段")).toBeNull();
  });
});
