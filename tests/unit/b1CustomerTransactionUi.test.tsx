// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@xlb/api-client";
import type { Order, PaymentOrder } from "@xlb/types";
import { toCustomerError } from "../../apps/customer/src/adapters/customerError";
import { CustomerOrderCreatePage } from "../../apps/customer/src/pages/CustomerOrderCreatePage";
import { CustomerOrdersPage } from "../../apps/customer/src/pages/CustomerOrdersPage";

const orderFixture: Order = {
  orderId: "order-real-1",
  cityCode: "hangzhou",
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "云栖小区 1 幢 101",
  contactName: "李女士",
  contactPhone: "13800000001",
  scheduledAt: "2026-07-20T01:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-1",
  skuId: "sku-real-1",
  skuName: "目录返回服务",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-1",
  priceText: "以服务端报价为准",
  priceType: "fixed",
  basePrice: 88,
  currency: "CNY",
  totalAmount: 88,
  quoteSnapshot: null,
  status: "service_completed",
  createdAt: "2026-07-18T01:00:00.000Z",
  updatedAt: "2026-07-18T01:00:00.000Z",
};

beforeEach(() => {
  window.history.replaceState({}, "", "/customer/order/create?skuId=sku-real-1");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
});

afterEach(cleanup);

describe("B1 顾客端交易错误状态", () => {
  it.each([
    ["network", undefined, "offline"],
    ["http", 401, "unauthorized"],
    ["http", 403, "forbidden"],
    ["http", 422, "validation"],
  ] as const)("将 %s/%s 映射为 %s 中文恢复态", (kind, status, expected) => {
    const error = new ApiClientError({
      kind,
      method: "GET",
      path: "/api/orders/order-1",
      message: "request failed",
      status,
    });
    const result = toCustomerError(error);
    expect(result.kind).toBe(expected);
    expect(result.title).toMatch(/[\u4e00-\u9fff]/);
    expect(result.description).toMatch(/[\u4e00-\u9fff]/);
  });

  it("区分重复提交、冲突和未知结果", () => {
    const duplicate = new ApiClientError({
      kind: "http",
      method: "POST",
      path: "/api/orders",
      message: "conflict",
      status: 409,
      responseBody: JSON.stringify({ error: "duplicate idempotency key" }),
    });
    const conflict = new ApiClientError({ kind: "http", method: "POST", path: "/api/orders", message: "conflict", status: 409 });
    expect(toCustomerError(duplicate).kind).toBe("duplicate");
    expect(toCustomerError(conflict).kind).toBe("conflict");
    expect(toCustomerError(new Error("unexpected")).kind).toBe("unknown");
  });
});

describe("B1-02 服务配置、地址与报价", () => {
  it("只展示目录和报价接口返回的服务数据，且不预填演示地址", async () => {
    const getPriceQuote = vi.fn().mockResolvedValue({
      quote: {
        cityCode: "hangzhou",
        skuId: "sku-real-1",
        basePrice: 88,
        currency: "CNY",
        priceText: "每次 88 元",
        priceType: "fixed",
        minPrice: null,
        maxPrice: null,
        pricingNote: null,
        priceRuleId: "price-rule-1",
        version: 1,
        skuProfile: null,
        standards: [],
        breakdown: { baseAmount: 88, requiredFeeAmount: 0, optionalFeeAmount: 0, totalAmount: 88, feeItems: [] },
      },
    });
    render(<CustomerOrderCreatePage
      api={{
        getPriceQuote,
        createOrder: vi.fn(),
        getOrder: vi.fn(),
        listAddresses: vi.fn().mockResolvedValue({ addresses: [] }),
        listCouponGrants: vi.fn().mockResolvedValue({ couponGrants: [] }),
      }}
      catalogState={{
        status: "success",
        data: {
          cityCode: "hangzhou",
          categories: [{
            categoryId: "category-real-1",
            cityCode: "hangzhou",
            name: "目录返回类目",
            sortOrder: 1,
            isEnabled: true,
            items: [{
              itemId: "item-real-1",
              categoryId: "category-real-1",
              cityCode: "hangzhou",
              name: "目录返回项目",
              sortOrder: 1,
              isEnabled: true,
              skus: [{ skuId: "sku-real-1", itemId: "item-real-1", cityCode: "hangzhou", name: "目录返回服务", unit: "次", sortOrder: 1, isEnabled: true }],
            }],
          }],
        },
      }}
      cityCode="hangzhou"
      onOrderCreated={vi.fn()}
    />);

    expect(await screen.findByText("目录返回服务")).toBeTruthy();
    expect((screen.getByPlaceholderText("请填写小区、楼栋、门牌号等") as HTMLTextAreaElement).value).toBe("");
    expect((screen.getByLabelText("联系人") as HTMLInputElement).value).toBe("");
    expect(screen.queryByText(/演示用户|演示小区/)).toBeNull();
    expect(getPriceQuote).toHaveBeenCalledWith("sku-real-1");

    fireEvent.change(screen.getByLabelText("详细地址"), { target: { value: "云栖小区 1 幢 101" } });
    fireEvent.change(screen.getByLabelText("联系人"), { target: { value: "李女士" } });
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800000001" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择时间" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：确认预约" }));
    expect(await screen.findByText("服务端实时报价")).toBeTruthy();
    expect(await screen.findByText(/每次 88 元/)).toBeTruthy();
  });
});

describe("B1-05 订单详情与支付结果", () => {
  it("只创建服务端支付单，不在顾客端伪造支付成功", async () => {
    window.history.replaceState({}, "", "/customer/orders?orderId=order-real-1");
    const payment: PaymentOrder = {
      paymentOrderId: "payment-real-1",
      orderId: "order-real-1",
      cityCode: "hangzhou",
      amount: 88,
      currency: "CNY",
      status: "pending",
      provider: "mock",
      providerTradeNo: null,
      metadata: { orderId: "order-real-1", cityCode: "hangzhou", skuId: "sku-real-1", priceRuleId: "price-rule-1" },
      createdAt: "2026-07-18T01:00:00.000Z",
      updatedAt: "2026-07-18T01:00:00.000Z",
    };
    const createPaymentOrder = vi.fn().mockResolvedValue({ paymentOrder: payment });
    const api = {
      listOrders: vi.fn().mockResolvedValue({ orders: [orderFixture], nextCursor: null }),
      getOrder: vi.fn().mockResolvedValue({ order: orderFixture }),
      getOrderReview: vi.fn().mockResolvedValue({ review: null }),
      confirmService: vi.fn(),
      createPaymentOrder,
      createRefundRequest: vi.fn(),
      createOrderReview: vi.fn(),
      createReviewAppeal: vi.fn(),
      withdrawReviewAppeal: vi.fn(),
    };
    render(<CustomerOrdersPage api={api} cityCode="hangzhou" />);

    fireEvent.click(await screen.findByRole("button", { name: "立即支付" }));
    fireEvent.click(await screen.findByRole("button", { name: "确认支付" }));
    expect(api.listOrders).toHaveBeenCalledWith({ limit: 20 });
    await waitFor(() => expect(createPaymentOrder).toHaveBeenCalledWith({ orderId: "order-real-1" }));
    expect(await screen.findByText("支付单已创建，请按支付渠道完成支付，并刷新确认结果。")).toBeTruthy();
    expect(screen.queryByText("支付成功")).toBeNull();
    expect(api).not.toHaveProperty("mockPaySuccess");
  });
});
