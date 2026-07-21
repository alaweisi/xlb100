// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClientError } from "@xlb/api-client";
import type { CatalogSnapshot, Order, PriceQuote } from "@xlb/types";
import { CustomerOrderCreatePage, type CustomerOrderCreatePageProps } from "../../apps/customer/src/pages/CustomerOrderCreatePage";

const catalog: CatalogSnapshot = {
  cityCode: "hangzhou",
  categories: [{
    categoryId: "category-1",
    cityCode: "hangzhou",
    name: "家庭保洁",
    sortOrder: 1,
    isEnabled: true,
    items: [{
      itemId: "item-1",
      categoryId: "category-1",
      cityCode: "hangzhou",
      name: "目录服务",
      sortOrder: 1,
      isEnabled: true,
      skus: [{
        skuId: "sku-1",
        itemId: "item-1",
        cityCode: "hangzhou",
        name: "目录服务标准项",
        unit: "次",
        profile: null,
        standards: [],
        sortOrder: 1,
        isEnabled: true,
      }],
    }],
  }],
};

const quote: PriceQuote = {
  cityCode: "hangzhou",
  skuId: "sku-1",
  basePrice: 120,
  currency: "CNY",
  priceText: "服务端固定报价",
  priceType: "fixed",
  minPrice: null,
  maxPrice: null,
  pricingNote: null,
  priceRuleId: "price-rule-1",
  version: 1,
  skuProfile: null,
  standards: [],
  breakdown: {
    baseAmount: 120,
    requiredFeeAmount: 0,
    optionalFeeAmount: 0,
    totalAmount: 120,
    feeItems: [],
  },
};

const order: Order = {
  orderId: "order-1",
  cityCode: "hangzhou",
  addressProvince: "浙江省",
  addressCity: "杭州市",
  addressDistrict: "西湖区",
  detailAddress: "文三路 100 号",
  contactName: "测试用户",
  contactPhone: "13800000001",
  scheduledAt: "2026-07-20T01:00:00.000Z",
  scheduledTimeSlot: "morning",
  customerId: "customer-1",
  skuId: "sku-1",
  skuName: "目录服务标准项",
  quantity: 1,
  unit: "次",
  priceRuleId: "price-rule-1",
  priceText: "服务端固定报价",
  priceType: "fixed",
  basePrice: 120,
  currency: "CNY",
  totalAmount: 120,
  quoteSnapshot: null,
  status: "pending_dispatch",
  createdAt: "2026-07-19T08:00:00.000Z",
  updatedAt: "2026-07-19T08:00:00.000Z",
};

function createApi(): CustomerOrderCreatePageProps["api"] {
  return {
    getPriceQuote: vi.fn().mockResolvedValue({ quote }),
    createOrder: vi.fn().mockResolvedValue({ order }),
    getOrder: vi.fn().mockResolvedValue({ order }),
  };
}

function enterRequiredBookingDetails() {
  fireEvent.change(screen.getByLabelText("详细地址"), { target: { value: "文三路 100 号" } });
  fireEvent.change(screen.getByLabelText("联系人"), { target: { value: "测试用户" } });
  fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800000001" } });
  fireEvent.click(screen.getByRole("button", { name: "下一步：选择时间" }));
  fireEvent.click(screen.getByRole("button", { name: "下一步：确认预约" }));
}

beforeEach(() => {
  window.history.replaceState({}, "", "/customer/order/create");
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockReturnValue({
      matches: true,
      media: "",
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }),
  });
});

describe("CustomerOrderCreatePage", () => {
  it("renders explicit loading, empty, and error catalog states", () => {
    const api = createApi();
    const onRetryCatalog = vi.fn();
    const { rerender } = render(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "loading" }}
        cityCode="hangzhou"
        onOrderCreated={vi.fn()}
        onRetryCatalog={onRetryCatalog}
      />,
    );
    expect(screen.getByText("服务目录加载中")).toBeTruthy();

    rerender(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "success", data: { cityCode: "hangzhou", categories: [] } }}
        cityCode="hangzhou"
        onOrderCreated={vi.fn()}
        onRetryCatalog={onRetryCatalog}
      />,
    );
    expect(screen.getByText("暂无可预约服务")).toBeTruthy();

    rerender(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "error", error: "catalog unavailable" }}
        cityCode="hangzhou"
        onOrderCreated={vi.fn()}
        onRetryCatalog={onRetryCatalog}
      />,
    );
    expect(screen.getByText("服务目录加载失败")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(onRetryCatalog).toHaveBeenCalledTimes(1);
  });

  it("completes the stepped booking flow and shows success only after server confirmation", async () => {
    const api = createApi();
    const onOrderCreated = vi.fn();
    render(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "success", data: catalog }}
        cityCode="hangzhou"
        onOrderCreated={onOrderCreated}
      />,
    );

    expect((screen.getByRole("button", { name: "下一步：填写地址" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("请先选择一项可预约服务")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("服务项目"), { target: { value: "sku-1" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写地址" }));

    fireEvent.change(screen.getByLabelText("详细地址"), { target: { value: "文三路 100 号" } });
    fireEvent.change(screen.getByLabelText("联系人"), { target: { value: "测试用户" } });
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "123" } });
    expect(screen.getByText("请输入 11 位中国大陆手机号")).toBeTruthy();
    expect((screen.getByRole("button", { name: "下一步：选择时间" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("手机号"), { target: { value: "13800000001" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步：选择时间" }));
    fireEvent.click(screen.getByRole("button", { name: "下一步：确认预约" }));

    expect(await screen.findByText("服务端实时报价")).toBeTruthy();
    await waitFor(() => expect((screen.getByRole("button", { name: "提交预约" }) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByText("预约已提交")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "提交预约" }));

    await waitFor(() => expect(api.createOrder).toHaveBeenCalledTimes(1));
    expect(api.getOrder).toHaveBeenCalledWith("order-1");
    expect(onOrderCreated).toHaveBeenCalledWith("order-1");
    expect(await screen.findByText("预约已提交")).toBeTruthy();
    expect(screen.getByText("order-1")).toBeTruthy();
  });

  it("supports quote retry without losing the booking draft", async () => {
    const api = createApi();
    api.getPriceQuote = vi.fn()
      .mockRejectedValueOnce(new Error("pricing unavailable"))
      .mockResolvedValueOnce({ quote });
    render(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "success", data: catalog }}
        cityCode="hangzhou"
        onOrderCreated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("服务项目"), { target: { value: "sku-1" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写地址" }));
    enterRequiredBookingDetails();

    expect(await screen.findByText("报价获取失败")).toBeTruthy();
    expect(screen.getByText("请先重新获取报价")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重新获取" }));
    expect(await screen.findByText("服务端实时报价")).toBeTruthy();
    expect(api.getPriceQuote).toHaveBeenCalledTimes(2);
    expect(screen.getByText("文三路 100 号", { exact: false })).toBeTruthy();
  });

  it("surfaces authoritative duplicate submission semantics and does not claim success", async () => {
    const api = createApi();
    api.createOrder = vi.fn().mockRejectedValue(new ApiClientError({
      kind: "http",
      message: "duplicate",
      method: "POST",
      path: "/api/orders",
      status: 409,
      responseBody: "duplicate idempotency key",
    }));
    render(
      <CustomerOrderCreatePage
        api={api}
        catalogState={{ status: "success", data: catalog }}
        cityCode="hangzhou"
        onOrderCreated={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("服务项目"), { target: { value: "sku-1" } });
    fireEvent.click(screen.getByRole("button", { name: "下一步：填写地址" }));
    enterRequiredBookingDetails();
    await waitFor(() => expect((screen.getByRole("button", { name: "提交预约" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "提交预约" }));

    expect(await screen.findByText("请勿重复提交")).toBeTruthy();
    expect(screen.getByText("服务端已收到相同请求，请先查看最新结果。")).toBeTruthy();
    expect(api.getOrder).not.toHaveBeenCalled();
    expect(screen.queryByText("预约已提交")).toBeNull();
  });
});
