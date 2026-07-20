// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CatalogSnapshot, CustomerWorkerShowcaseResponse } from "@xlb/types";
import { CustomerHomePage } from "../../apps/customer/src/pages/CustomerHomePage";
import { CustomerServicesPage } from "../../apps/customer/src/pages/CustomerServicesPage";

const categoryNames = [
  "家庭保洁",
  "家电清洗",
  "家电维修",
  "上门安装",
  "管道疏通",
  "开锁换锁",
  "水电维修",
  "防水补漏/精准测漏",
  "家具家居维修保养",
  "房屋修缮/局部改造",
  "搬家搬运/拆旧清运",
  "甲醛检测治理",
  "数码办公维修",
  "洗衣洗鞋",
  "保姆月嫂/照护",
  "四害消杀",
] as const;

const featuredSkuIds = ["sku_home_daily_2h", "sku_ac_wall_basic", "sku_lock_unlock_standard"] as const;

const catalog: CatalogSnapshot = {
  cityCode: "hangzhou",
  categories: categoryNames.map((name, index) => {
    const categoryId = `category-${index + 1}`;
    const skuId = featuredSkuIds[index] ?? `sku-${index + 1}`;
    return {
      categoryId,
      cityCode: "hangzhou",
      name,
      sortOrder: index + 1,
      isEnabled: true,
      items: [{
        itemId: `item-${index + 1}`,
        categoryId,
        cityCode: "hangzhou",
        name: `${name}服务`,
        sortOrder: 1,
        isEnabled: true,
        skus: [{
          skuId,
          itemId: `item-${index + 1}`,
          cityCode: "hangzhou",
          name: `${name}标准服务`,
          unit: "次",
          profile: null,
          standards: [],
          sortOrder: 1,
          isEnabled: true,
        }],
      }],
    };
  }),
};

const workerShowcase: CustomerWorkerShowcaseResponse = {
  ok: true,
  items: [{
    showcaseId: "public-showcase-a",
    displayName: "张师傅",
    skillCategoryNames: ["家庭保洁", "家电清洗"],
    averageRating: 4.9,
    ratingCount: 32,
    certificationLabel: "平台认证",
  }],
  disclosure: "仅展示平台师傅的服务能力与公开评价；顾客不能联系、指定或直接预约师傅，订单仍由平台统一派单。",
};

describe("customer homepage backend bindings", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/customer/");
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

  afterEach(cleanup);

  it("maps all 16 real categories to filtered service routes and real featured SKUs", async () => {
    const api = {
      getNotificationUnreadCount: vi.fn().mockResolvedValue({ ok: true, unreadCount: 7 }),
      listWorkerShowcase: vi.fn().mockResolvedValue(workerShowcase),
    };
    const { container } = render(
      <CustomerHomePage
        api={api}
        cityCode="hangzhou"
        catalogState={{ status: "success", data: catalog }}
        onRetryCatalog={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByRole("link", { name: "打开消息中心，7 条未读消息" }).getAttribute("href")).toBe("/customer/notifications");
    });
    expect(screen.getByRole("button", { name: "切换城市，当前杭州" })).toBeTruthy();
    expect(screen.queryByText(/西湖区/)).toBeNull();
    expect(screen.getByPlaceholderText("搜索全部上门服务")).toBeTruthy();
    for (const [index, name] of categoryNames.entries()) {
      const link = screen.getByRole("link", { name: `${name}，查看真实服务清单` });
      expect(link.getAttribute("href")).toContain(`categoryId=category-${index + 1}`);
    }
    for (const skuId of featuredSkuIds) {
      expect(container.querySelector(`[data-sku-id="${skuId}"]`)).not.toBeNull();
    }
    await waitFor(() => expect(api.listWorkerShowcase).toHaveBeenCalledOnce());
  });

  it("keeps worker information as a read-only capability showcase", async () => {
    const api = {
      getNotificationUnreadCount: vi.fn().mockResolvedValue({ ok: true, unreadCount: 0 }),
      listWorkerShowcase: vi.fn().mockResolvedValue(workerShowcase),
    };
    render(
      <CustomerHomePage
        api={api}
        cityCode="hangzhou"
        catalogState={{ status: "success", data: catalog }}
        onRetryCatalog={vi.fn()}
      />,
    );

    const showcase = await screen.findByLabelText("师傅能力展示列表");
    expect(screen.getByText("张师傅")).toBeTruthy();
    expect(screen.getByText("家庭保洁 · 家电清洗")).toBeTruthy();
    expect(screen.getByLabelText("评分 4.9，共 32 条评价")).toBeTruthy();
    expect(showcase.querySelectorAll("a, button, input")).toHaveLength(0);
    expect(showcase.textContent).not.toMatch(/电话|联系师傅|预约师傅|指定师傅/);
    expect(screen.getByLabelText(workerShowcase.disclosure)).toBeTruthy();
    expect(screen.getByText("仅展示技能与评分，订单由平台统一派单")).toBeTruthy();
  });

  it("opens a homepage category link as the matching filtered SKU list", async () => {
    window.history.replaceState({}, "", "/customer/services?cityCode=hangzhou&categoryId=category-2");
    render(
      <CustomerServicesPage
        cityCode="hangzhou"
        catalogState={{ status: "success", data: catalog }}
        onRetryCatalog={vi.fn()}
      />,
    );

    expect(await screen.findByText("家电清洗标准服务")).toBeTruthy();
    expect(screen.queryByText("家庭保洁标准服务")).toBeNull();
    expect(screen.getByText("1 项")).toBeTruthy();
  });

  it("searches the complete catalog by category and SKU text from the homepage query", async () => {
    window.history.replaceState({}, "", "/customer/services?cityCode=hangzhou&q=家电清洗");
    render(
      <CustomerServicesPage
        cityCode="hangzhou"
        catalogState={{ status: "success", data: catalog }}
        onRetryCatalog={vi.fn()}
      />,
    );

    expect(await screen.findByText("家电清洗标准服务")).toBeTruthy();
    expect(screen.queryByText("家庭保洁标准服务")).toBeNull();
    expect(screen.getByText("1 项")).toBeTruthy();
  });
});
