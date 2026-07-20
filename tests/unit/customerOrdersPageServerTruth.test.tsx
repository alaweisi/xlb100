// @vitest-environment jsdom
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Order } from "@xlb/types";
import { CustomerOrdersPage } from "../../apps/customer/src/pages/CustomerOrdersPage.js";

const order: Order = {
  orderId: "order-server-1",
  cityCode: "hangzhou",
  addressProvince: "Zhejiang",
  addressCity: "Hangzhou",
  addressDistrict: "Xihu",
  detailAddress: "No. 1",
  contactName: "Lin",
  contactPhone: "13800000001",
  scheduledAt: "2026-07-20T08:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-server",
  skuId: "sku-server",
  skuName: "Server sourced cleaning",
  quantity: 1,
  unit: "time",
  priceRuleId: "price-server",
  priceText: "100",
  priceType: "fixed",
  basePrice: 100,
  currency: "CNY",
  totalAmount: 100,
  quoteSnapshot: null,
  status: "pending_dispatch",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

describe("CustomerOrdersPage server truth", () => {
  it("renders orders returned by the server without local device order ids", async () => {
    window.localStorage.clear();
    const listOrders = vi.fn().mockResolvedValue({ orders: [order], nextCursor: null });
    const api = {
      listOrders,
      getOrder: vi.fn(),
      confirmService: vi.fn(),
      createPaymentOrder: vi.fn(),
      mockPaySuccess: vi.fn(),
      createRefundRequest: vi.fn(),
      createOrderReview: vi.fn(),
      getOrderReview: vi.fn().mockResolvedValue({ review: null }),
      createReviewAppeal: vi.fn(),
      withdrawReviewAppeal: vi.fn(),
    };

    render(<CustomerOrdersPage api={api} cityCode="hangzhou" />);

    expect((await screen.findAllByText("Server sourced cleaning")).length).toBeGreaterThan(0);
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith({ limit: 20 }));
    expect(window.localStorage.length).toBe(0);
  });
});
