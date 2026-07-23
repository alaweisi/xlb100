// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { CatalogSnapshot } from "@xlb/types";
import { describe, expect, it, vi } from "vitest";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  CUSTOMER_DISCOVERY_CORE_COMPONENTS,
  CustomerDiscoveryTemplate,
  ServiceDiscoveryActionController,
  ServiceDiscoveryCoordinator,
  ServiceDiscoveryPage,
  createCustomerDiscoveryComponentRegistry,
  createCustomerDiscoveryViewModel,
  customerDiscoveryTemplateRegistration,
  customerServiceDiscoveryRouteModule,
  customerServiceDiscoverySlice,
  parseCustomerDiscoveryPresentationPlan,
  type CustomerDiscoveryNavigation,
} from "../../apps/customer/src/features/service/index.js";

function catalog(): CatalogSnapshot {
  return {
    cityCode: "hangzhou",
    categories: [
      {
        categoryId: "category-b",
        cityCode: "hangzhou",
        name: "维修服务",
        sortOrder: 2,
        isEnabled: true,
        items: [{
          itemId: "item-b",
          categoryId: "category-b",
          cityCode: "hangzhou",
          name: "设备维修",
          sortOrder: 1,
          isEnabled: true,
          skus: [{
            skuId: "sku-b",
            itemId: "item-b",
            cityCode: "hangzhou",
            name: "设备检修",
            unit: "次",
            profile: null,
            standards: [],
            sortOrder: 1,
            isEnabled: true,
          }],
        }],
      },
      {
        categoryId: "category-a",
        cityCode: "hangzhou",
        name: "清洁服务",
        sortOrder: 1,
        isEnabled: true,
        items: [{
          itemId: "item-a",
          categoryId: "category-a",
          cityCode: "hangzhou",
          name: "深度清洁",
          sortOrder: 1,
          isEnabled: true,
          skus: [
            {
              skuId: "sku-a",
              itemId: "item-a",
              cityCode: "hangzhou",
              name: "全屋清洁",
              unit: "次",
              profile: null,
              standards: [],
              sortOrder: 1,
              isEnabled: true,
            },
            {
              skuId: "sku-disabled",
              itemId: "item-a",
              cityCode: "hangzhou",
              name: "已停用服务",
              unit: "次",
              profile: null,
              standards: [],
              sortOrder: 2,
              isEnabled: false,
            },
          ],
        }],
      },
    ],
  };
}

function route() {
  return {
    pathname: "/service",
    pattern: "/service" as const,
    params: {},
    query: {},
  };
}

describe("Customer CSL-05 Service Discovery", () => {
  it("filters only enabled Catalog facts and preserves authoritative sort order", () => {
    const all = createCustomerDiscoveryViewModel(catalog(), {
      categoryId: null,
      query: "",
    });
    const matched = createCustomerDiscoveryViewModel(catalog(), {
      categoryId: "category-a",
      query: "深度清洁 全屋",
    });
    const unknownCategory = createCustomerDiscoveryViewModel(catalog(), {
      categoryId: "not-in-catalog",
      query: "",
    });

    expect(all.categories.map((category) => category.name)).toEqual([
      "清洁服务",
      "维修服务",
    ]);
    expect(all.results.map((service) => service.skuId)).toEqual(["sku-a", "sku-b"]);
    expect(matched.results.map((service) => service.skuId)).toEqual(["sku-a"]);
    expect(unknownCategory.filters.categoryId).toBeNull();
    expect(all.results.some((service) => service.skuId === "sku-disabled")).toBe(false);
  });

  it("uses a city-scoped Catalog cache only as an explicit stale read fallback", async () => {
    const getCatalog = vi.fn()
      .mockResolvedValueOnce({ ok: true, catalog: catalog() })
      .mockRejectedValueOnce(new Error("offline"));
    const coordinator = new ServiceDiscoveryCoordinator({ getCatalog });

    await expect(coordinator.load("hangzhou")).resolves.toMatchObject({
      status: "ready",
      freshness: "fresh",
    });
    await expect(coordinator.load("hangzhou")).resolves.toMatchObject({
      status: "ready",
      freshness: "stale",
      staleReason: "catalog_refresh_failed",
    });
    await expect(coordinator.load("shanghai")).resolves.toMatchObject({
      status: "error",
      errorCode: "catalog_response_invalid",
    });
  });

  it("rejects cross-city and structurally invalid Catalog responses", async () => {
    const shanghaiCatalog: CatalogSnapshot = {
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
          })),
        })),
      })),
    };
    const crossCity = new ServiceDiscoveryCoordinator({
      getCatalog: vi.fn().mockResolvedValue({
        ok: true,
        catalog: shanghaiCatalog,
      }),
    });
    const invalid = new ServiceDiscoveryCoordinator({
      getCatalog: vi.fn().mockResolvedValue({
        ok: true,
        catalog: { cityCode: "hangzhou", categories: [{ name: "bad" }] },
      }),
    });

    await expect(crossCity.load("hangzhou")).resolves.toMatchObject({
      status: "unavailable",
      reasonCode: "catalog_city_mismatch",
    });
    await expect(invalid.load("hangzhou")).resolves.toMatchObject({
      status: "error",
      errorCode: "catalog_response_invalid",
      retryable: false,
    });
  });

  it("treats a Catalog without enabled SKU results as catalog-empty", async () => {
    const emptyCatalog: CatalogSnapshot = {
      ...catalog(),
      categories: catalog().categories.map((category) => ({
        ...category,
        items: category.items.map((item) => ({
          ...item,
          skus: item.skus.map((sku) => ({ ...sku, isEnabled: false })),
        })),
      })),
    };
    const coordinator = new ServiceDiscoveryCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: emptyCatalog }),
    });

    await expect(coordinator.load("hangzhou")).resolves.toEqual({
      status: "empty",
      reasonCode: "catalog_empty",
    });
  });

  it("keeps navigation controlled by valid Catalog ids", () => {
    const navigation: CustomerDiscoveryNavigation = {
      replaceDiscovery: vi.fn(),
      openSku: vi.fn(),
    };
    const controller = new ServiceDiscoveryActionController(navigation);
    const scope = {
      categoryIds: new Set(["category-a"]),
      skuIds: new Set(["sku-a"]),
    };

    const filtered = controller.selectCategory(
      { categoryId: null, query: "清洁" },
      "category-a",
      scope,
    );
    const clearedUnknown = controller.selectCategory(filtered, "unknown", scope);

    expect(filtered.categoryId).toBe("category-a");
    expect(clearedUnknown.categoryId).toBeNull();
    expect(controller.openSku("unknown", scope)).toBe(false);
    expect(controller.openSku("sku-a", scope)).toBe(true);
    expect(navigation.openSku).toHaveBeenCalledWith("sku-a");
  });

  it("registers a protected L2 template and only finite presentation slots", async () => {
    const registry = createCustomerDiscoveryComponentRegistry();
    const templateRegistry = new CustomerTemplateRegistry()
      .register(customerDiscoveryTemplateRegistration)
      .seal();
    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerServiceDiscoveryRouteModule)
      .seal();

    expect(registry.list()).toEqual([
      ...CUSTOMER_DISCOVERY_CORE_COMPONENTS,
      "catalog-scope-note",
    ]);
    expect(templateRegistry.resolveForSlice(customerServiceDiscoverySlice)?.orchestrationLevel)
      .toBe("L2");
    expect(routeRegistry.resolve("/service")?.slice.id).toBe("CSL-05");
    await expect(routeRegistry.resolve("/service")?.load()).resolves.toHaveProperty(
      "RouteComponent",
      ServiceDiscoveryPage,
    );
    expect(parseCustomerDiscoveryPresentationPlan({
      slots: [{ type: "catalog-scope-note", position: "before-results" }],
    }).slots).toHaveLength(1);
    expect(parseCustomerDiscoveryPresentationPlan({
      slots: [{ type: "search-field", position: "before-results" }],
    }).slots).toEqual([]);
  });

  it("renders loading, empty, error and unavailable boundaries without fallback data", () => {
    const { rerender } = render(
      <CustomerDiscoveryTemplate
        slice={customerServiceDiscoverySlice}
        route={route()}
        operationalManifest={null}
        state={{ status: "loading", requestKey: null, previousActorDataVisible: false }}
      />,
    );
    expect(screen.getByText("正在读取服务目录")).toBeTruthy();

    rerender(
      <CustomerDiscoveryTemplate
        slice={customerServiceDiscoverySlice}
        route={route()}
        operationalManifest={null}
        state={{ status: "empty", reasonCode: "catalog_empty", recovery: null }}
      />,
    );
    expect(screen.getByText("当前城市暂无可用服务")).toBeTruthy();

    rerender(
      <CustomerDiscoveryTemplate
        slice={customerServiceDiscoverySlice}
        route={route()}
        operationalManifest={null}
        state={{
          status: "error",
          errorCode: "catalog_response_invalid",
          retryable: false,
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText("服务目录加载失败")).toBeTruthy();

    rerender(
      <CustomerDiscoveryTemplate
        slice={customerServiceDiscoverySlice}
        route={route()}
        operationalManifest={null}
        state={{
          status: "unavailable",
          capability: "customer.catalog",
          reasonCode: "catalog_api_unavailable",
          recovery: null,
        }}
      />,
    );
    expect(screen.getByText(/不会展示替代或演示数据/)).toBeTruthy();
  });

  it("renders and operates the fixed core from a real Catalog API boundary", async () => {
    const coordinator = new ServiceDiscoveryCoordinator({
      getCatalog: vi.fn().mockResolvedValue({ ok: true, catalog: catalog() }),
    });
    const navigation: CustomerDiscoveryNavigation = {
      replaceDiscovery: vi.fn(),
      openSku: vi.fn(),
    };

    render(
      <ServiceDiscoveryPage
        slice={customerServiceDiscoverySlice}
        route={{ ...route(), query: { categoryId: "unknown-category" } }}
        cityCode="hangzhou"
        coordinator={coordinator}
        navigation={navigation}
        presentationPlan={{
          slots: [{ type: "catalog-scope-note", position: "before-results" }],
        }}
      />,
    );

    expect(screen.getByText("正在读取服务目录")).toBeTruthy();
    await screen.findByRole("heading", { name: "找到适合你的服务" });
    expect(screen.getByText("2", { selector: ".xlb-discovery-result-count strong" }))
      .toBeTruthy();
    expect(screen.getByText(/页面仅展示当前城市正式目录/)).toBeTruthy();
    await waitFor(() => {
      expect(navigation.replaceDiscovery).toHaveBeenCalledWith({
        categoryId: null,
        query: "",
      });
    });

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索服务" }), {
      target: { value: "设备维修" },
    });
    await waitFor(() => {
      expect(screen.getByText("设备检修")).toBeTruthy();
      expect(screen.queryByText("全屋清洁")).toBeNull();
    });

    fireEvent.click(screen.getByRole("button", { name: "查看设备检修服务详情" }));
    expect(navigation.openSku).toHaveBeenCalledWith("sku-b");
    expect(screen.queryByText(/¥|￥|元起/)).toBeNull();
  });
});
