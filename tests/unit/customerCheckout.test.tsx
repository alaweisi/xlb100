// @vitest-environment jsdom
import React from "react";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  CatalogSnapshot,
  CustomerAddress,
  Order,
  PriceQuote,
} from "@xlb/types";
import {
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_CHECKOUT_COMPONENTS,
  CheckoutActionController,
  CheckoutCoordinator,
  CustomerCheckoutPage,
  CustomerCheckoutStepperTemplate,
  checkoutStepCanContinue,
  createCustomerCheckoutComponentRegistry,
  customerCheckoutFeatureRouteModule,
  customerCheckoutSlice,
  customerCheckoutTemplateRegistration,
  parseCustomerCheckoutSkuId,
  type CustomerCheckoutNavigation,
} from "../../apps/customer/src/features/checkout/index.js";

function catalog(): CatalogSnapshot {
  return {
    cityCode: "hangzhou",
    categories: [{
      categoryId: "cleaning",
      cityCode: "hangzhou",
      name: "家庭保洁",
      sortOrder: 1,
      isEnabled: true,
      items: [{
        itemId: "deep-clean",
        categoryId: "cleaning",
        cityCode: "hangzhou",
        name: "深度清洁",
        sortOrder: 1,
        isEnabled: true,
        skus: [{
          skuId: "sku-clean",
          itemId: "deep-clean",
          cityCode: "hangzhou",
          name: "全屋深度清洁",
          unit: "次",
          profile: {
            skuId: "sku-clean",
            cityCode: "hangzhou",
            serviceMode: "cleaning",
            brandScope: null,
            modelScope: null,
            skillLevel: "advanced",
            warrantyDays: 7,
            requiresModel: false,
            requiresMeasurement: false,
            supportsEnterprise: true,
            serviceGuaranteeText: "按正式标准履约",
          },
          standards: [{
            standardId: "standard-clean",
            skuId: "sku-clean",
            cityCode: "hangzhou",
            standardType: "inspection",
            title: "验收标准",
            content: "逐项确认",
            sortOrder: 1,
            isRequired: true,
            isEnabled: true,
          }],
          sortOrder: 1,
          isEnabled: true,
        }],
      }],
    }],
  };
}

function quote(overrides: Partial<PriceQuote> = {}): PriceQuote {
  return {
    cityCode: "hangzhou",
    skuId: "sku-clean",
    basePrice: 199,
    currency: "CNY",
    priceText: "¥199/次",
    priceType: "fixed",
    minPrice: null,
    maxPrice: null,
    pricingNote: "以服务端订单快照为准",
    priceRuleId: "rule-clean",
    version: 3,
    skuProfile: catalog().categories[0]!.items[0]!.skus[0]!.profile,
    standards: catalog().categories[0]!.items[0]!.skus[0]!.standards,
    breakdown: {
      baseAmount: 199,
      requiredFeeAmount: 0,
      optionalFeeAmount: 0,
      totalAmount: 199,
      feeItems: [{
        feeItemId: "fee-clean",
        cityCode: "hangzhou",
        priceRuleId: "rule-clean",
        skuId: "sku-clean",
        feeCode: "base",
        feeName: "基础服务费",
        feeType: "base",
        chargeMethod: "fixed",
        amount: 199,
        minAmount: null,
        maxAmount: null,
        unit: "次",
        isOptional: false,
        isEnabled: true,
        sortOrder: 1,
      }],
    },
    ...overrides,
  };
}

function address(
  overrides: Partial<CustomerAddress> = {},
): CustomerAddress {
  return {
    addressId: "addr-hz-1",
    customerId: "customer-current",
    cityCode: "hangzhou",
    contactName: "林女士",
    contactPhoneMasked: "138****0001",
    province: "浙江省",
    city: "杭州市",
    district: "西湖区",
    detailAddress: "文三路 1 号",
    isDefault: true,
    createdAt: "2026-07-24T08:00:00.000Z",
    updatedAt: "2026-07-24T08:00:00.000Z",
    ...overrides,
  };
}

function order(
  overrides: Partial<Order> = {},
): Order {
  return {
    orderId: "order-1",
    cityCode: "hangzhou",
    addressProvince: "浙江省",
    addressCity: "杭州市",
    addressDistrict: "西湖区",
    detailAddress: "文三路 1 号",
    contactName: "林女士",
    contactPhone: "13800000001",
    scheduledAt: "2026-07-26T01:00:00.000Z",
    scheduledTimeSlot: "morning",
    customerId: "customer-current",
    skuId: "sku-clean",
    skuName: "全屋深度清洁",
    quantity: 1,
    unit: "次",
    priceRuleId: "rule-clean",
    priceText: "¥199/次",
    priceType: "fixed",
    basePrice: 199,
    currency: "CNY",
    totalAmount: 199,
    quoteSnapshot: null,
    status: "pending_dispatch",
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt: "2026-07-24T09:00:00.000Z",
    ...overrides,
  };
}

function route(query: Readonly<Record<string, string>> = { skuId: "sku-clean" }) {
  return {
    pathname: "/order/create",
    pattern: "/order/create" as const,
    params: {},
    query,
  };
}

function api(overrides: Record<string, unknown> = {}) {
  return {
    getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
    getPriceQuote: vi.fn().mockResolvedValue({ ok: true, quote: quote() }),
    listAddresses: vi.fn().mockResolvedValue({
      ok: true,
      addresses: [address()],
    }),
    createOrder: vi.fn().mockResolvedValue({
      ok: true,
      order: order(),
    }),
    ...overrides,
  };
}

function navigation(): CustomerCheckoutNavigation {
  return {
    backToService: vi.fn(),
    openAddressPicker: vi.fn(),
    openOrderDetail: vi.fn(),
  };
}

describe("Customer CSL-07 Checkout", () => {
  it("registers the formal route as a fixed protected L1 slice", async () => {
    const components = createCustomerCheckoutComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerCheckoutTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerCheckoutFeatureRouteModule)
      .seal();

    expect(components.list()).toEqual(CUSTOMER_CHECKOUT_COMPONENTS);
    expect(templates.resolveForSlice(customerCheckoutSlice)).toMatchObject({
      orchestrationLevel: "L1",
      operationalManifest: "forbidden",
    });
    expect(routes.resolve("/order/create")?.slice).toMatchObject({
      id: "CSL-07",
      guards: ["session", "city", "protected-route"],
    });
    await expect(routes.resolve("/order/create")?.load()).resolves
      .toHaveProperty("RouteComponent", CustomerCheckoutPage);
  });

  it("accepts only an exact skuId on /order/create", () => {
    expect(parseCustomerCheckoutSkuId(route())).toBe("sku-clean");
    expect(parseCustomerCheckoutSkuId(route({ skuId: "../other" }))).toBeNull();
    expect(parseCustomerCheckoutSkuId(route({ skuId: " sku-clean " }))).toBeNull();
    expect(parseCustomerCheckoutSkuId(route({}))).toBeNull();
  });

  it("verifies Catalog, Quote and current-city addresses before becoming ready", async () => {
    const customerApi = api();
    const coordinator = new CheckoutCoordinator(customerApi);

    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "ready",
      facts: {
        service: {
          identity: { skuId: "sku-clean", name: "全屋深度清洁" },
          quote: { priceText: "¥199/次", version: 3 },
        },
        addresses: [{ addressId: "addr-hz-1", contactPhoneMasked: "138****0001" }],
      },
    });
    expect(customerApi.getCatalog).toHaveBeenCalledBefore(customerApi.getPriceQuote);
    expect(customerApi.getPriceQuote).toHaveBeenCalledBefore(customerApi.listAddresses);

    const crossCity = new CheckoutCoordinator(api({
      listAddresses: vi.fn().mockResolvedValue({
        ok: true,
        addresses: [address({ cityCode: "shanghai" })],
      }),
    }));
    await expect(crossCity.load("hangzhou", "sku-clean")).resolves.toEqual({
      status: "conflict",
      conflictCode: "address_city_mismatch",
    });
  });

  it("requires a fresh full phone and uses a submission lock without claiming ordinary server idempotency", async () => {
    let resolveCreate!: (value: { ok: true; order: Order }) => void;
    const createPending = new Promise<{ ok: true; order: Order }>((resolve) => {
      resolveCreate = resolve;
    });
    const customerApi = api({
      createOrder: vi.fn(() => createPending),
    });
    const coordinator = new CheckoutCoordinator(customerApi);
    const controller = new CheckoutActionController(coordinator);
    const draft = {
      quantity: 2,
      addressId: "addr-hz-1",
      contactPhone: "13800000001",
      requestedDate: "2026-07-26",
      requestedTimeSlot: "afternoon" as const,
    };
    const scope = {
      cityCode: "hangzhou" as const,
      verifiedSkuId: "sku-clean",
      addresses: [address()],
      quote: quote(),
    };

    await expect(controller.submit(
      { ...draft, contactPhone: "138****0001" },
      scope,
      "2026-07-25",
    )).resolves.toMatchObject({
      status: "validation_error",
      errors: { contactPhone: expect.any(String) },
    });
    const first = controller.submit(draft, scope, "2026-07-25");
    await expect(controller.submit(draft, scope, "2026-07-25")).resolves.toEqual({
      status: "conflict",
      conflictCode: "request_in_flight",
    });

    expect(customerApi.createOrder).toHaveBeenCalledWith({
      skuId: "sku-clean",
      quantity: 2,
      addressProvince: "浙江省",
      addressCity: "杭州市",
      addressDistrict: "西湖区",
      detailAddress: "文三路 1 号",
      contactName: "林女士",
      contactPhone: "13800000001",
      scheduledAt: "2026-07-26T06:00:00.000Z",
      scheduledTimeSlot: "afternoon",
    });
    expect(customerApi.createOrder.mock.calls[0]![0]).not.toHaveProperty(
      "orderIdempotencyKey",
    );
    expect(customerApi.createOrder.mock.calls[0]![0]).not.toHaveProperty(
      "discountDecisionId",
    );
    resolveCreate({ ok: true, order: order({ quantity: 2 }) });
    await expect(first).resolves.toMatchObject({
      status: "success",
      order: { status: "pending_dispatch" },
    });
  });

  it("renders honest common boundaries and no fake business data", () => {
    const base = {
      slice: customerCheckoutSlice,
      route: route(),
    };
    const { rerender } = render(
      <CustomerCheckoutStepperTemplate
        {...base}
        state={{
          status: "loading",
          requestKey: null,
          previousActorDataVisible: false,
        }}
      />,
    );
    expect(screen.getByText("正在准备预约")).toBeTruthy();

    rerender(
      <CustomerCheckoutStepperTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "quote_response_invalid",
          retryable: false,
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会拼装替代数据/)).toBeTruthy();

    rerender(
      <CustomerCheckoutStepperTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "quote_version_conflict",
          refreshRequired: true,
          recovery: { actionKey: "retry", labelKey: "重新读取" },
        }}
      />,
    );
    expect(screen.getByText("预约事实已经变化")).toBeTruthy();

    rerender(
      <CustomerCheckoutStepperTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.catalog",
          reasonCode: "sku_not_found",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("该服务无法预约")).toBeTruthy();
  });

  it("completes service, address, request-time and safe no-coupon steps before creating the order", async () => {
    const customerApi = api();
    const nav = navigation();
    render(
      <CustomerCheckoutPage
        slice={customerCheckoutSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CheckoutCoordinator(customerApi)}
        navigation={nav}
        now={new Date("2026-07-24T08:00:00+08:00")}
      />,
    );

    await screen.findByRole("heading", { name: "核对服务与数量" });
    expect(screen.getByText(/页面不按数量重算业务金额/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    await screen.findByRole("heading", { name: "选择服务地址" });
    fireEvent.click(screen.getByRole("radio", { name: /林女士/u }));
    expect(screen.getByText(/系统不会从掩码推断号码/)).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "完整手机号码" }), {
      target: { value: "13800000001" },
    });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    await screen.findByRole("heading", { name: "填写请求时间" });
    expect(screen.getByText(/不代表平台已确认容量或预约成功/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("请求日期"), {
      target: { value: "2026-07-26" },
    });
    fireEvent.click(screen.getByRole("radio", { name: /下午/u }));
    fireEvent.click(screen.getByRole("button", { name: "继续" }));

    await screen.findByRole("heading", { name: "优惠能力" });
    expect(screen.getByText(/不会从 grantId、管理端定义或本地常量拼装/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重读报价并确认" }));

    await screen.findByRole("heading", { name: "确认并创建订单" });
    expect(customerApi.getPriceQuote).toHaveBeenCalledTimes(2);
    expect(screen.getByText("已重新读取并确认当前服务端 Quote。")).toBeTruthy();
    expect(screen.getByText(/最终金额、价格类型与明细以服务端创建订单后/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "确认创建订单" }));

    await waitFor(() => {
      expect(nav.openOrderDetail).toHaveBeenCalledWith("order-1");
    });
    expect(customerApi.createOrder).toHaveBeenCalledWith(expect.objectContaining({
      skuId: "sku-clean",
      contactPhone: "13800000001",
      scheduledTimeSlot: "afternoon",
    }));
    expect(customerApi.createOrder.mock.calls[0]![0]).not.toHaveProperty(
      "orderIdempotencyKey",
    );
    expect(customerApi.createOrder.mock.calls[0]![0]).not.toHaveProperty(
      "discountDecisionId",
    );
    expect(window.localStorage.getItem("xlb.customer.checkoutDraft")).toBeNull();
  });

  it("keeps the CSL-20 picker as an addressId-only seam", async () => {
    const customerApi = api();
    const nav = navigation();
    render(
      <CustomerCheckoutPage
        slice={customerCheckoutSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={new CheckoutCoordinator(customerApi)}
        navigation={nav}
        now={new Date("2026-07-24T08:00:00+08:00")}
      />,
    );

    await screen.findByRole("heading", { name: "核对服务与数量" });
    fireEvent.click(screen.getByRole("button", { name: "继续" }));
    await screen.findByRole("heading", { name: "选择服务地址" });
    fireEvent.click(screen.getByRole("button", { name: "在地址簿中新增或管理" }));
    expect(nav.openAddressPicker).toHaveBeenCalledOnce();

    window.dispatchEvent(new CustomEvent("xlb:customer-address-selected", {
      detail: { addressId: "addr-hz-1" },
    }));
    await screen.findByText("已从地址簿接收地址。请重新输入完整联系电话。");
    expect(customerApi.listAddresses).toHaveBeenCalledTimes(2);
    expect((screen.getByRole("textbox", {
      name: "完整手机号码",
    }) as HTMLInputElement).value).toBe("");
  });

  it("does not treat a request slot as capacity and only enables valid local progress", () => {
    const base = {
      quantity: 1,
      addressId: "addr-hz-1",
      contactPhone: "13800000001",
      requestedDate: "2026-07-26",
      requestedTimeSlot: "morning" as const,
    };
    expect(checkoutStepCanContinue(
      "schedule",
      base,
      [address()],
      "hangzhou",
      "2026-07-25",
    )).toBe(true);
    expect(checkoutStepCanContinue(
      "schedule",
      { ...base, requestedDate: "2026-07-24" },
      [address()],
      "hangzhou",
      "2026-07-25",
    )).toBe(false);
  });
});
