// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import type { CatalogSnapshot } from "@xlb/types";
import { ThemeProvider } from "@xlb/ui";
import { describe, expect, it, vi } from "vitest";
import {
  CUSTOMER_SERVICE_CATEGORY_ASSETS,
  OFFICIAL_SERVICE_CATEGORY_NAMES,
} from "../../apps/customer/src/assets/serviceCategoryAssets";
import { CustomerHomePage } from "../../apps/customer/src/pages/CustomerHomePage";

function catalogWith(categoryNames: readonly string[]): CatalogSnapshot {
  return {
    cityCode: "hangzhou",
    categories: categoryNames.map((name, index) => ({
      categoryId: `category-${index + 1}`,
      code: `category-${index + 1}`,
      name,
      description: name,
      sortOrder: index + 1,
      isEnabled: true,
      items: [],
    })),
  } as CatalogSnapshot;
}

function renderHome(
  catalogState: Parameters<typeof CustomerHomePage>[0]["catalogState"],
  onRetryCatalog = vi.fn(),
) {
  return render(
    <ThemeProvider>
      <CustomerHomePage
        cityCode="hangzhou"
        catalogState={catalogState}
        onRetryCatalog={onRetryCatalog}
      />
    </ThemeProvider>,
  );
}

describe("CustomerHomePage master", () => {
  it("renders the locked brand language, 16 official categories and trust contract", () => {
    const { container } = renderHome({
      status: "success",
      data: catalogWith(OFFICIAL_SERVICE_CATEGORY_NAMES),
    });

    expect(screen.getByRole("heading", { level: 1, name: "喜乐帮" })).not.toBeNull();
    expect(screen.getByRole("search")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "全部服务" })).not.toBeNull();
    for (const categoryName of OFFICIAL_SERVICE_CATEGORY_NAMES) {
      expect(screen.getByRole("button", { name: `查看${categoryName}服务` })).not.toBeNull();
    }
    expect(container.querySelectorAll("img[src*='/assets/service-categories/']")).toHaveLength(
      CUSTOMER_SERVICE_CATEGORY_ASSETS.length,
    );
    for (const trustLabel of ["实名认证", "价格透明", "服务留痕", "售后保障"]) {
      expect(screen.getByText(trustLabel)).not.toBeNull();
    }
    expect(screen.queryByText(/Service search|Search cleaning|not-wired/i)).toBeNull();
  });

  it("keeps incomplete catalog data honest instead of inventing missing categories", () => {
    renderHome({
      status: "success",
      data: catalogWith(OFFICIAL_SERVICE_CATEGORY_NAMES.slice(0, 3)),
    });

    expect(screen.getByText("当前已开放 3 项正式服务，其余类目将在目录开放后显示。")).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /查看.+服务/ })).toHaveLength(3);
    expect(screen.getByText("附近师傅信息暂未开放")).not.toBeNull();
    expect(screen.queryByText(/平台认证|可接单状态以实时数据为准/)).toBeNull();
  });

  it("supports stable loading and retryable error states", () => {
    const loading = renderHome({ status: "loading" });
    expect(screen.getByLabelText("服务类目正在加载").getAttribute("aria-busy")).toBe("true");
    loading.unmount();

    const onRetryCatalog = vi.fn();
    renderHome({ status: "error", error: "network" }, onRetryCatalog);
    fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
    expect(onRetryCatalog).toHaveBeenCalledTimes(1);
  });
});
