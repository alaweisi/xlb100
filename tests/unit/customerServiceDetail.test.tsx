// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { ApiClientError } from "@xlb/api-client";
import type {
  CatalogSnapshot,
  PriceQuote,
} from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_SERVICE_DETAIL_CORE_COMPONENTS,
  CustomerSkuDetailTemplate,
  ServiceDetailActionController,
  ServiceDetailCoordinator,
  ServiceDetailPage,
  createBrowserCustomerServiceDetailNavigation,
  createCustomerServiceDetailComponentRegistry,
  customerServiceDetailSlice,
  customerServiceDiscoveryRouteModule,
  customerSkuDetailTemplateRegistration,
  parseCustomerServiceDetailPresentationPlan,
  type CustomerServiceDetailNavigation,
} from "../../apps/customer/src/features/service/index.js";

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
            serviceGuaranteeText: "按正式服务保障标准履约",
          },
          standards: [{
            standardId: "standard-2",
            skuId: "sku-clean",
            cityCode: "hangzhou",
            standardType: "safety",
            title: "安全标准",
            content: "服务前确认现场安全条件",
            sortOrder: 2,
            isRequired: true,
            isEnabled: true,
          }, {
            standardId: "standard-disabled",
            skuId: "sku-clean",
            cityCode: "hangzhou",
            standardType: "material",
            title: "停用标准",
            content: "不得展示",
            sortOrder: 1,
            isRequired: false,
            isEnabled: false,
          }, {
            standardId: "standard-1",
            skuId: "sku-clean",
            cityCode: "hangzhou",
            standardType: "inspection",
            title: "验收标准",
            content: "按正式验收项逐项确认",
            sortOrder: 1,
            isRequired: true,
            isEnabled: true,
          }],
          sortOrder: 1,
          isEnabled: true,
        }, {
          skuId: "sku-disabled",
          itemId: "deep-clean",
          cityCode: "hangzhou",
          name: "停用服务",
          unit: "次",
          profile: null,
          standards: [],
          sortOrder: 2,
          isEnabled: false,
        }],
      }],
    }],
  };
}

function quote(): PriceQuote {
  return {
    cityCode: "hangzhou",
    skuId: "sku-clean",
    basePrice: 199,
    currency: "CNY",
    priceText: "¥199/次",
    priceType: "fixed",
    minPrice: null,
    maxPrice: null,
    pricingNote: "最终金额以预约流程重新报价为准",
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
        feeItemId: "fee-base",
        cityCode: "hangzhou",
        priceRuleId: "rule-clean",
        skuId: "sku-clean",
        feeCode: "base_service_fee",
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
  };
}

function route() {
  return {
    pathname: "/service/sku-clean",
    pattern: "/service/:skuId" as const,
    params: { skuId: "sku-clean" },
    query: {},
  };
}

function apiError(
  kind: "network" | "timeout" | "http",
  status?: number,
): ApiClientError {
  return new ApiClientError({
    kind,
    message: "test",
    method: "GET",
    path: "/api/pricing/quote",
    status,
  });
}

function readyState(freshness: "fresh" | "stale" = "fresh") {
  return {
    status: "ready" as const,
    data: {
      viewModel: {
        cityCode: "hangzhou",
        identity: {
          skuId: "sku-clean",
          name: "全屋深度清洁",
          unit: "次",
          categoryName: "家庭保洁",
          itemName: "深度清洁",
          pathLabel: "家庭保洁 · 深度清洁",
          profile: catalog().categories[0]!.items[0]!.skus[0]!.profile,
          standards: catalog().categories[0]!.items[0]!.skus[0]!.standards
            .filter((standard) => standard.isEnabled),
        },
        quote: quote(),
        freshness,
        staleReason: freshness === "stale" ? "quote_refresh_failed" : null,
      },
      actions: {
        onBack: vi.fn(),
        onStartCheckout: vi.fn(),
      },
    },
  };
}

describe("Customer CSL-06 Service Detail", () => {
  it("loads only an enabled current-city Catalog SKU before its authoritative quote", async () => {
    const getCatalog = vi.fn().mockResolvedValue({ ok: true, catalog: catalog() });
    const getPriceQuote = vi.fn().mockResolvedValue({ ok: true, quote: quote() });
    const coordinator = new ServiceDetailCoordinator({ getCatalog, getPriceQuote });

    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "ready",
      detail: {
        cityCode: "hangzhou",
        identity: {
          skuId: "sku-clean",
          name: "全屋深度清洁",
          standards: [
            { standardId: "standard-1" },
            { standardId: "standard-2" },
          ],
        },
        quote: {
          priceText: "¥199/次",
          breakdown: { totalAmount: 199 },
        },
        freshness: "fresh",
      },
    });
    expect(getCatalog).toHaveBeenCalledBefore(getPriceQuote);
    expect(getPriceQuote).toHaveBeenCalledWith("sku-clean");
  });

  it("maps unknown, disabled, malformed and cross-city SKU routes to one safe unavailable boundary", async () => {
    const getPriceQuote = vi.fn();
    const coordinator = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
      getPriceQuote,
    });
    const crossCity = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({
        ok: true,
        catalog: {
          ...catalog(),
          cityCode: "shanghai",
          categories: catalog().categories.map((category) => ({
            ...category,
            cityCode: "shanghai",
            items: category.items.map((item) => ({
              ...item,
              cityCode: "shanghai",
              skus: item.skus.map((sku) => ({
                ...sku,
                cityCode: "shanghai",
                profile: sku.profile === null
                  ? null
                  : { ...sku.profile, cityCode: "shanghai" },
                standards: sku.standards.map((standard) => ({
                  ...standard,
                  cityCode: "shanghai",
                })),
              })),
            })),
          })),
        },
      }),
      getPriceQuote,
    });

    await expect(coordinator.load("hangzhou", "missing")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "sku_not_found",
    });
    await expect(coordinator.load("hangzhou", "sku-disabled")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "sku_not_found",
    });
    await expect(coordinator.load("hangzhou", " sku-clean ")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "sku_not_found",
    });
    await expect(crossCity.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "catalog_city_mismatch",
    });
    expect(getPriceQuote).not.toHaveBeenCalled();
  });

  it("rejects quote facts that do not match the requested city, SKU or price rule", async () => {
    const coordinator = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
      getPriceQuote: vi.fn().mockResolvedValue({
        ok: true,
        quote: {
          ...quote(),
          breakdown: {
            ...quote().breakdown,
            feeItems: quote().breakdown.feeItems.map((fee) => ({
              ...fee,
              skuId: "other-sku",
            })),
          },
        },
      }),
    });

    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toEqual({
      status: "error",
      errorCode: "quote_response_invalid",
      retryable: false,
    });
  });

  it("uses city-and-SKU-scoped cached facts only as an explicit stale transient fallback", async () => {
    const getCatalog = vi.fn()
      .mockResolvedValueOnce({ ok: true, catalog: catalog() })
      .mockResolvedValueOnce({ ok: true, catalog: catalog() })
      .mockRejectedValueOnce(apiError("network"));
    const getPriceQuote = vi.fn()
      .mockResolvedValueOnce({ ok: true, quote: quote() })
      .mockRejectedValueOnce(apiError("timeout"));
    const coordinator = new ServiceDetailCoordinator({ getCatalog, getPriceQuote });

    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "ready",
      detail: { freshness: "fresh" },
    });
    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "ready",
      detail: {
        freshness: "stale",
        staleReason: "quote_refresh_failed",
      },
    });
    await expect(coordinator.load("hangzhou", "sku-clean")).resolves.toMatchObject({
      status: "ready",
      detail: {
        freshness: "stale",
        staleReason: "catalog_refresh_failed",
      },
    });
    await expect(coordinator.load("shanghai", "sku-clean")).resolves.toMatchObject({
      status: "error",
    });
  });

  it("maps quote conflict and missing quote capability without guessing a price", async () => {
    const conflict = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
      getPriceQuote: vi.fn().mockRejectedValue(apiError("http", 409)),
    });
    const unavailable = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
      getPriceQuote: vi.fn().mockRejectedValue(apiError("http", 404)),
    });

    await expect(conflict.load("hangzhou", "sku-clean")).resolves.toEqual({
      status: "conflict",
      conflictCode: "quote_version_conflict",
    });
    await expect(unavailable.load("hangzhou", "sku-clean")).resolves.toEqual({
      status: "unavailable",
      capability: "customer.pricing-quote",
      reasonCode: "quote_api_unavailable",
    });
  });

  it("guards the checkout seam with the verified SKU and a fixed navigation target", () => {
    const navigation: CustomerServiceDetailNavigation = {
      backToDiscovery: vi.fn(),
      openCheckout: vi.fn(),
    };
    const controller = new ServiceDetailActionController(navigation);

    expect(controller.startCheckout("other", { skuId: "sku-clean" })).toBe(false);
    expect(controller.startCheckout("sku-clean", { skuId: "sku-clean" })).toBe(true);
    expect(navigation.openCheckout).toHaveBeenCalledWith("sku-clean");
    controller.backToDiscovery();
    expect(navigation.backToDiscovery).toHaveBeenCalledOnce();

    const browserNavigation = createBrowserCustomerServiceDetailNavigation();
    browserNavigation.openCheckout("sku-clean");
    expect(window.location.pathname).toBe("/checkout");
    expect(new URLSearchParams(window.location.search).get("skuId")).toBe("sku-clean");
    browserNavigation.backToDiscovery();
    expect(window.location.pathname).toBe("/service");
  });

  it("registers CSL-06 as a protected L2 route and limits Manifest to display-only slots", async () => {
    const components = createCustomerServiceDetailComponentRegistry();
    const templates = new CustomerTemplateRegistry()
      .register(customerSkuDetailTemplateRegistration)
      .seal();
    const routes = new CustomerFeatureRouteRegistry()
      .register(customerServiceDiscoveryRouteModule)
      .seal();

    expect(components.list()).toEqual([
      ...CUSTOMER_SERVICE_DETAIL_CORE_COMPONENTS,
      "catalog-verification-note",
      "quote-refresh-note",
    ]);
    expect(templates.resolveForSlice(customerServiceDetailSlice)?.orchestrationLevel).toBe("L2");
    expect(routes.resolve("/service/:skuId")?.slice).toMatchObject({
      id: "CSL-06",
      guards: ["session", "city", "protected-route"],
    });
    await expect(routes.resolve("/service/:skuId")?.load()).resolves.toHaveProperty(
      "RouteComponent",
      ServiceDetailPage,
    );

    expect(parseCustomerServiceDetailPresentationPlan({
      slots: [
        { type: "catalog-verification-note", position: "after-price" },
        { type: "quote-refresh-note", position: "before-standards" },
      ],
    }).slots).toHaveLength(2);
    expect(parseCustomerServiceDetailPresentationPlan({
      slots: [{ type: "fee-breakdown", position: "after-price" }],
    }).slots).toEqual([]);
    expect(parseCustomerServiceDetailPresentationPlan({
      slots: [
        { type: "catalog-verification-note", position: "after-price" },
        { type: "quote-refresh-note", position: "after-price" },
      ],
    }).slots).toEqual([]);
  });

  it("renders loading, empty, error, conflict, unavailable and stale boundaries honestly", () => {
    const base = {
      slice: customerServiceDetailSlice,
      route: route(),
      operationalManifest: null,
    };
    const { rerender } = render(
      <CustomerSkuDetailTemplate
        {...base}
        state={{ status: "loading", requestKey: null, previousActorDataVisible: false }}
      />,
    );
    expect(screen.getByText("正在读取服务详情")).toBeTruthy();

    rerender(
      <CustomerSkuDetailTemplate
        {...base}
        state={{ status: "empty", reasonCode: "service_detail_empty", recovery: null }}
      />,
    );
    expect(screen.getByText("暂无可展示的服务详情")).toBeTruthy();

    rerender(
      <CustomerSkuDetailTemplate
        {...base}
        state={{
          status: "error",
          errorCode: "quote_response_invalid",
          retryable: false,
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("接口返回内容无法安全展示。")).toBeTruthy();

    rerender(
      <CustomerSkuDetailTemplate
        {...base}
        state={{
          status: "conflict",
          conflictCode: "quote_version_conflict",
          refreshRequired: true,
          recovery: { actionKey: "retry", labelKey: "重新读取" },
        }}
      />,
    );
    expect(screen.getByText("报价状态已变化")).toBeTruthy();

    rerender(
      <CustomerSkuDetailTemplate
        {...base}
        state={{
          status: "unavailable",
          capability: "customer.service-detail",
          reasonCode: "sku_not_found",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("服务不存在或当前城市不可用")).toBeTruthy();

    rerender(
      <CustomerSkuDetailTemplate {...base} state={readyState("stale")} />,
    );
    expect(screen.getByText(/最近一次成功读取的详情与报价/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "进入服务预约" })).toBeTruthy();
  });

  it("renders API facts and navigates the primary action to the CSL-07 seam", async () => {
    const navigation: CustomerServiceDetailNavigation = {
      backToDiscovery: vi.fn(),
      openCheckout: vi.fn(),
    };
    const coordinator = new ServiceDetailCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
      getPriceQuote: vi.fn().mockResolvedValue({ ok: true, quote: quote() }),
    });

    render(
      <ServiceDetailPage
        slice={customerServiceDetailSlice}
        route={route()}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation}
        presentationPlan={{
          slots: [
            { type: "catalog-verification-note", position: "after-price" },
            { type: "quote-refresh-note", position: "before-standards" },
          ],
        }}
      />,
    );

    expect(screen.getByText("正在读取服务详情")).toBeTruthy();
    await screen.findByRole("heading", { name: "全屋深度清洁" });
    expect(screen.getAllByText("¥199/次").length).toBeGreaterThan(0);
    expect(screen.getByText("按正式服务保障标准履约")).toBeTruthy();
    expect(screen.getByText("验收标准")).toBeTruthy();
    expect(screen.queryByText("停用标准")).toBeNull();
    expect(screen.getByText("基础服务费")).toBeTruthy();
    expect(screen.getByText(/进入预约流程后会重新读取正式报价/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "进入服务预约" }));
    expect(navigation.openCheckout).toHaveBeenCalledWith("sku-clean");
  });
});
