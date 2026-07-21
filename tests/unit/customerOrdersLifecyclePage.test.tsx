// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { CustomerOrderReviewView, Order, PaymentOrder, RefundRequest } from "@xlb/types";
import { ThemeProvider } from "@xlb/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CustomerOrdersPage } from "../../apps/customer/src/pages/CustomerOrdersPage";

const NOW = "2026-07-22T08:00:00.000Z";

function order(status: Order["status"], orderId = `order-${status}`): Order {
  return {
    orderId,
    cityCode: "hangzhou",
    addressProvince: "浙江省",
    addressCity: "杭州市",
    addressDistrict: "西湖区",
    detailAddress: "文三路 100 号",
    contactName: "张女士",
    contactPhone: "13800000000",
    scheduledAt: "2026-07-23",
    scheduledTimeSlot: "morning",
    customerId: "customer-1",
    skuId: "sku-cleaning",
    skuName: "2小时日常保洁",
    quantity: 1,
    unit: "次",
    priceRuleId: "price-1",
    priceText: "¥128.00/次",
    priceType: "fixed",
    basePrice: 128,
    currency: "CNY",
    totalAmount: 128,
    quoteSnapshot: null,
    status,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

const payment: PaymentOrder = {
  paymentOrderId: "payment-1",
  orderId: "order-service_completed",
  cityCode: "hangzhou",
  amount: 128,
  currency: "CNY",
  status: "pending",
  provider: "mock",
  providerTradeNo: null,
  metadata: {
    orderId: "order-service_completed",
    cityCode: "hangzhou",
    skuId: "sku-cleaning",
    priceRuleId: "price-1",
    customerId: "customer-1",
  },
  createdAt: NOW,
  updatedAt: NOW,
};

const refund: RefundRequest = {
  refundId: "refund-1",
  cityCode: "hangzhou",
  orderId: "order-paid",
  customerId: "customer-1",
  fulfillmentId: "fulfillment-1",
  paymentOrderId: "payment-1",
  amount: 128,
  currency: "CNY",
  reason: "服务问题",
  status: "requested",
  requestedAt: NOW,
  approvedAt: null,
  approvedByAdminId: null,
};

function reviewView(visibility: "pending_moderation" | "visible" | "hidden" = "pending_moderation"): CustomerOrderReviewView {
  return {
    review: {
      reviewId: "review-1",
      cityCode: "hangzhou",
      orderId: "order-paid",
      customerId: "customer-1",
      workerId: "worker-1",
      fulfillmentId: "fulfillment-1",
      rating: 5,
      comment: "服务认真，沟通及时。",
      status: "created",
      createdAt: NOW,
      updatedAt: NOW,
    },
    visibility: {
      reviewId: "review-1",
      visibility,
      moderationVersion: 1,
      version: 1,
      lastDecisionId: visibility === "pending_moderation" ? null : "decision-1",
      updatedAt: NOW,
    },
    appeals: [],
  };
}

function createApi(orders: Record<string, Order>, reviews: Record<string, CustomerOrderReviewView | null> = {}) {
  return {
    listOrders: vi.fn(async () => ({ orders: Object.values(orders), nextCursor: null })),
    getOrder: vi.fn(async (orderId: string) => ({ order: orders[orderId] })),
    confirmService: vi.fn(async (orderId: string) => ({ order: { ...orders[orderId], status: "service_completed" as const } })),
    createPaymentOrder: vi.fn(async () => ({ paymentOrder: payment })),
    mockPaySuccess: vi.fn(async () => ({ paymentOrder: { ...payment, status: "paid" as const }, orderId: payment.orderId, idempotent: false })),
    createRefundRequest: vi.fn(async () => ({ refund, idempotent: false })),
    createOrderReview: vi.fn(async ({ orderId, rating, comment }: { orderId: string; rating: number; comment: string }) => ({
      review: { ...reviewView().review, orderId, rating, comment },
      idempotent: false,
    })),
    getOrderReview: vi.fn(async (orderId: string) => ({ review: reviews[orderId] ?? null })),
    createReviewAppeal: vi.fn(async () => ({ appeal: {
      appealId: "appeal-1", cityCode: "hangzhou" as const, reviewId: "review-1", moderationVersion: 1,
      subjectType: "customer" as const, subjectId: "customer-1", reason: "申请复核", status: "open" as const,
      version: 1, resolutionReason: null, openedAt: NOW, resolvedAt: null, resolvedByAdminId: null,
    }, idempotent: false })),
    withdrawReviewAppeal: vi.fn(async () => ({ appeal: {
      appealId: "appeal-1", cityCode: "hangzhou" as const, reviewId: "review-1", moderationVersion: 1,
      subjectType: "customer" as const, subjectId: "customer-1", reason: "申请复核", status: "withdrawn" as const,
      version: 2, resolutionReason: null, openedAt: NOW, resolvedAt: NOW, resolvedByAdminId: null,
    }, idempotent: false })),
  };
}

function renderOrders(api: ReturnType<typeof createApi>, _orderIds: string[]) {
  return render(
    <ThemeProvider>
      <CustomerOrdersPage api={api} cityCode="hangzhou" />
    </ThemeProvider>,
  );
}

describe("CustomerOrdersPage complete lifecycle", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/customer/orders?cityCode=hangzhou");
    vi.stubGlobal("crypto", { randomUUID: () => "00000000-0000-4000-8000-000000000001" });
  });

  it("presents authoritative order statuses in the locked Customer visual language", async () => {
    const orders = Object.fromEntries([
      order("pending_dispatch"), order("service_completed"), order("pending_payment"), order("paid"), order("cancelled"),
    ].map((item) => [item.orderId, item]));
    const { container } = renderOrders(createApi(orders), Object.keys(orders));

    expect(await screen.findByRole("heading", { level: 1, name: "我的订单" })).not.toBeNull();
    expect(screen.getByText("服务进行中")).not.toBeNull();
    expect(screen.getByText("待支付")).not.toBeNull();
    expect(screen.getByText("支付处理中")).not.toBeNull();
    expect(screen.getAllByText("已完成").length).toBeGreaterThan(0);
    expect(screen.getByText("已取消")).not.toBeNull();
    expect(screen.getByRole("button", { name: /确认服务完成/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /立即支付/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /评价本次服务/ })).not.toBeNull();
    expect(container.textContent).not.toMatch(/pending_dispatch|service_completed|Mock pay|API|not-wired/i);
  });

  it("reports a failed authoritative order-list request without showing stale local history", async () => {
    const api = createApi({});
    api.listOrders.mockRejectedValueOnce(new Error("network"));
    renderOrders(api, []);

    expect(await screen.findByText("暂时无法读取订单")).not.toBeNull();
    expect(screen.queryByText("2小时日常保洁")).toBeNull();
    expect(screen.getByRole("button", { name: "重新加载" })).not.toBeNull();
  });

  it("does not expose a review form while the persisted review state is unknown", async () => {
    const current = order("paid");
    const api = createApi({ [current.orderId]: current });
    api.getOrderReview.mockRejectedValueOnce(new Error("network"));
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: /评价本次服务/ }));

    expect(screen.getByText("评价状态暂未加载，确认状态前不能重复提交。")).not.toBeNull();
    expect(screen.queryByPlaceholderText("说说本次服务体验")).toBeNull();
    expect(screen.queryByRole("button", { name: "提交评价" })).toBeNull();
  });

  it("confirms service only after the server returns the next order state", async () => {
    const current = order("pending_dispatch");
    const api = createApi({ [current.orderId]: current });
    renderOrders(api, [current.orderId]);
    const open = await screen.findByRole("button", { name: /确认服务完成/ });
    fireEvent.click(open);
    const panel = screen.getByRole("heading", { name: "确认服务已经完成？" }).parentElement;
    expect(panel).not.toBeNull();
    fireEvent.click(within(panel!).getByRole("button", { name: "确认服务完成" }));

    await waitFor(() => expect(api.confirmService).toHaveBeenCalledWith(current.orderId));
    expect(await screen.findByText("服务已确认，订单已进入待支付状态。")).not.toBeNull();
    expect(screen.getByText("待支付")).not.toBeNull();
  });

  it("does not claim payment success when the command result is uncertain", async () => {
    const current = order("service_completed");
    const api = createApi({ [current.orderId]: current });
    api.createPaymentOrder.mockRejectedValueOnce({ kind: "timeout" });
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: /立即支付/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认支付" }));

    expect(await screen.findByText("支付结果待确认，请刷新订单后查看，不要重复操作。")).not.toBeNull();
    expect(screen.queryByText("支付成功，订单已完成。")).toBeNull();
    expect(screen.getByRole("button", { name: /刷新订单状态/ })).not.toBeNull();
  });

  it("creates a payment order without fabricating provider success", async () => {
    const current = order("service_completed");
    const paid = { ...current, status: "paid" as const };
    const api = createApi({ [current.orderId]: current });
    api.getOrder.mockResolvedValueOnce({ order: current }).mockResolvedValueOnce({ order: paid });
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: /立即支付/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认支付" }));

    await waitFor(() => expect(api.createPaymentOrder).toHaveBeenCalledWith({ orderId: current.orderId }));
    expect(api.mockPaySuccess).not.toHaveBeenCalled();
    expect(await screen.findByText("支付单已创建，请按支付渠道完成支付，并刷新确认结果。")).not.toBeNull();
    expect(screen.queryByText("支付成功，订单已完成。")).toBeNull();
  });

  it("submits an immutable review and then renders the persisted moderation state", async () => {
    const current = order("paid");
    const persisted = reviewView();
    const api = createApi({ [current.orderId]: current });
    api.getOrderReview.mockResolvedValueOnce({ review: null }).mockResolvedValueOnce({ review: persisted });
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: /评价本次服务/ }));
    fireEvent.change(screen.getByPlaceholderText("说说本次服务体验"), { target: { value: "服务认真，沟通及时。" } });
    fireEvent.click(screen.getByRole("button", { name: "提交评价" }));

    await waitFor(() => expect(api.createOrderReview).toHaveBeenCalledWith({
      orderId: current.orderId,
      rating: 5,
      comment: "服务认真，沟通及时。",
    }));
    expect(await screen.findByText("评价已提交，正在等待平台审核。")).not.toBeNull();
    expect(screen.getByText("审核中")).not.toBeNull();
  });

  it("creates only a refund request and reports it as pending review", async () => {
    const current = order("paid");
    const api = createApi({ [current.orderId]: current });
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: "申请售后" }));
    const panel = screen.getByRole("heading", { name: "提交售后退款申请" }).parentElement;
    expect(panel).not.toBeNull();
    fireEvent.change(within(panel!).getByPlaceholderText("请简要描述需要处理的问题"), { target: { value: "服务问题" } });
    fireEvent.click(within(panel!).getByRole("button", { name: "提交申请" }));

    await waitFor(() => expect(api.createRefundRequest).toHaveBeenCalledWith({ orderId: current.orderId, reason: "服务问题" }));
    expect(await screen.findByText("退款申请已提交，平台审核后会更新处理结果。")).not.toBeNull();
    expect(screen.queryByText("退款成功")).toBeNull();
  });

  it("keeps a hidden review appeal on the current moderation version and handles conflict honestly", async () => {
    const current = order("paid");
    const hidden = reviewView("hidden");
    const api = createApi({ [current.orderId]: current }, { [current.orderId]: hidden });
    api.createReviewAppeal.mockRejectedValueOnce({ status: 409 });
    renderOrders(api, [current.orderId]);
    fireEvent.click(await screen.findByRole("button", { name: /查看我的评价/ }));
    fireEvent.click(screen.getByRole("button", { name: "申请复核" }));
    fireEvent.change(screen.getByPlaceholderText("填写复核原因"), { target: { value: "评价内容真实，请重新审核。" } });
    fireEvent.click(screen.getByRole("button", { name: "提交复核申请" }));

    await waitFor(() => expect(api.createReviewAppeal).toHaveBeenCalledWith("review-1", {
      moderationVersion: 1,
      reason: "评价内容真实，请重新审核。",
      idempotencyKey: "customer-review-appeal-00000000-0000-4000-8000-000000000001",
    }));
    expect(await screen.findByText("审核结果已经变化或已有复核申请，请刷新评价状态。")).not.toBeNull();
    expect(screen.queryByText("复核申请已提交。")).toBeNull();
  });
});
