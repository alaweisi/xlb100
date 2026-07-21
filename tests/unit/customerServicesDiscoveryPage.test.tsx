// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CatalogSnapshot } from "@xlb/types";
import { ThemeProvider } from "@xlb/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  cityDisplayLabel,
  filterCatalogSkus,
  getCatalogSkus,
} from "../../apps/customer/src/adapters/catalogAdapters";
import { CustomerServicesPage } from "../../apps/customer/src/pages/CustomerServicesPage";

const catalog: CatalogSnapshot = {
  cityCode: "hangzhou",
  categories: [
    {
      categoryId: "cleaning",
      cityCode: "hangzhou",
      name: "家庭保洁",
      sortOrder: 1,
      isEnabled: true,
      items: [
        {
          itemId: "daily-cleaning",
          categoryId: "cleaning",
          cityCode: "hangzhou",
          name: "日常保洁",
          sortOrder: 1,
          isEnabled: true,
          skus: [
            {
              skuId: "sku-daily-cleaning",
              itemId: "daily-cleaning",
              cityCode: "hangzhou",
              name: "2小时日常保洁",
              unit: "次",
              profile: null,
              standards: [],
              sortOrder: 1,
              isEnabled: true,
            },
          ],
        },
      ],
    },
    {
      categoryId: "appliance-repair",
      cityCode: "hangzhou",
      name: "家电维修",
      sortOrder: 2,
      isEnabled: true,
      items: [
        {
          itemId: "air-conditioner-repair",
          categoryId: "appliance-repair",
          cityCode: "hangzhou",
          name: "空调维修",
          sortOrder: 1,
          isEnabled: true,
          skus: [
            {
              skuId: "sku-air-conditioner-repair",
              itemId: "air-conditioner-repair",
              cityCode: "hangzhou",
              name: "挂机空调检测维修",
              unit: "台",
              profile: null,
              standards: [],
              sortOrder: 1,
              isEnabled: true,
            },
          ],
        },
      ],
    },
  ],
};

function renderServices(
  catalogState: Parameters<typeof CustomerServicesPage>[0]["catalogState"] = {
    status: "success",
    data: catalog,
  },
  onRetryCatalog = vi.fn(),
) {
  return render(
    <ThemeProvider>
      <CustomerServicesPage
        cityCode="hangzhou"
        catalogState={catalogState}
        onRetryCatalog={onRetryCatalog}
      />
    </ThemeProvider>,
  );
}

describe("CustomerServicesPage service discovery", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/customer/services?cityCode=hangzhou");
  });

  it("renders only city-scoped catalog truth in the locked Customer visual language", () => {
    const { container } = renderServices();

    expect(screen.getByRole("heading", { level: 1, name: "找到适合的上门服务" })).not.toBeNull();
    expect(screen.getByRole("search")).not.toBeNull();
    expect(screen.getByRole("tab", { name: "全部" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "家庭保洁" })).not.toBeNull();
    expect(screen.getByRole("tab", { name: "家电维修" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "选择2小时日常保洁" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "选择挂机空调检测维修" })).not.toBeNull();
    expect(container.querySelector("img[src='/assets/service-categories/home-cleaning.png']")).not.toBeNull();
    expect(container.querySelector("img[src='/assets/service-categories/appliance-repair.png']")).not.toBeNull();
    expect(container.textContent).not.toMatch(/Service discovery|Available|not-wired/i);
    expect(container.textContent).not.toMatch(/[¥￥]\s*\d/);
  });

  it("filters from the URL query and lets the user recover from no results", () => {
    window.history.replaceState({}, "", "/customer/services?cityCode=hangzhou&q=空调");
    renderServices();

    expect(screen.getByRole("button", { name: "选择挂机空调检测维修" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "选择2小时日常保洁" })).toBeNull();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "不存在的服务" } });
    expect(screen.getByText("没有匹配的服务")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看全部服务" }));
    expect(new URLSearchParams(window.location.search).has("q")).toBe(false);
    expect(screen.getByRole("button", { name: "选择2小时日常保洁" })).not.toBeNull();
  });

  it("keeps category and selected SKU in the URL and exposes the exact order-creation contract", () => {
    renderServices();

    fireEvent.click(screen.getByRole("tab", { name: "家电维修" }));
    expect(new URLSearchParams(window.location.search).get("categoryId")).toBe("appliance-repair");
    expect(screen.queryByRole("button", { name: "选择2小时日常保洁" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "选择挂机空调检测维修" }));
    expect(new URLSearchParams(window.location.search).get("skuId")).toBe("sku-air-conditioner-repair");
    expect(document.querySelector('[aria-label="已选择挂机空调检测维修"]')?.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("complementary", { name: "已选服务" })).not.toBeNull();
    expect(screen.getByRole("link", { name: /继续预约/ }).getAttribute("href")).toBe(
      "/customer/order/create?cityCode=hangzhou&skuId=sku-air-conditioner-repair",
    );

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "保洁" } });
    expect(new URLSearchParams(window.location.search).has("skuId")).toBe(false);
    expect(screen.queryByRole("complementary", { name: "已选服务" })).toBeNull();
  });

  it("recovers honestly from a stale deep-linked SKU", () => {
    window.history.replaceState({}, "", "/customer/services?cityCode=hangzhou&skuId=retired-sku");
    renderServices();

    expect(screen.getByText("链接中的服务当前不可用")).not.toBeNull();
    expect(screen.queryByRole("complementary", { name: "已选服务" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看可用服务" }));
    expect(new URLSearchParams(window.location.search).has("skuId")).toBe(false);
  });

  it("covers initial loading, retryable failure and a genuinely empty city", () => {
    const loading = renderServices({ status: "loading" });
    expect(screen.getByLabelText("服务列表正在加载").getAttribute("aria-busy")).toBe("true");
    loading.unmount();

    const onRetryCatalog = vi.fn();
    const failed = renderServices({ status: "error", error: "network" }, onRetryCatalog);
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(onRetryCatalog).toHaveBeenCalledTimes(1);
    failed.unmount();

    renderServices({
      status: "success",
      data: { cityCode: "hangzhou", categories: [] },
    });
    expect(screen.getByText("当前城市暂未开放服务")).not.toBeNull();
  });

  it("keeps catalog filtering and Chinese city labels deterministic", () => {
    const skus = getCatalogSkus(catalog);

    expect(cityDisplayLabel("hangzhou")).toBe("杭州 · 西湖区");
    expect(filterCatalogSkus(skus, "空调", "all").map((sku) => sku.skuId)).toEqual([
      "sku-air-conditioner-repair",
    ]);
    expect(filterCatalogSkus(skus, "", "cleaning").map((sku) => sku.skuId)).toEqual([
      "sku-daily-cleaning",
    ]);
  });
});
