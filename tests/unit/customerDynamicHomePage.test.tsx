// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { customerSduiPageManifestSchema } from "@xlb/validators";
import { describe, expect, it, vi } from "vitest";
import {
  HomeCompositionEngine,
  HomeRenderer,
} from "../../apps/customer/src/platform/sdui/composition/index.js";
import { getBuiltinHomeManifest } from "../../apps/customer/src/platform/sdui/delivery/index.js";
import { createHomeActionRegistry } from "../../apps/customer/src/features/home/createHomeActionRegistry.js";
import { createHomeComponentRegistry } from "../../apps/customer/src/features/home/createHomeComponentRegistry.js";
import { createHomeDataRequestId } from "../../apps/customer/src/features/home/HomePage.js";
import { createHomeRuntimeBindingsResolver } from "../../apps/customer/src/features/home/homeRuntime.js";
import type { HomeDataBatchResult } from "../../apps/customer/src/platform/sdui/data/index.js";

function batchForBuiltin(): HomeDataBatchResult {
  const now = "2026-07-23T00:00:00.000Z";
  return {
    requestId: "home-test",
    state: "partial",
    startedAt: now,
    completedAt: now,
    issues: [],
    results: {
      "builtin.location": {
        sourceId: "builtin.location",
        dataKey: "customer.current_location",
        state: "success",
        value: {
          cityCode: "hangzhou",
          cityLabel: "杭州",
          districtLabel: null,
          displayLabel: "杭州",
        },
        cache: "miss",
        resolvedAt: now,
      },
      "builtin.notifications": {
        sourceId: "builtin.notifications",
        dataKey: "customer.notification_summary",
        state: "success",
        value: { unreadCount: 2 },
        cache: "miss",
        resolvedAt: now,
      },
      "builtin.categories": {
        sourceId: "builtin.categories",
        dataKey: "catalog.service_categories",
        state: "success",
        value: [
          { categoryId: "cat_01", name: "家庭保洁", sortOrder: 1, itemCount: 20 },
          { categoryId: "cat_16", name: "四害消杀", sortOrder: 16, itemCount: 10 },
        ],
        cache: "miss",
        resolvedAt: now,
      },
      "builtin.recommendations": {
        sourceId: "builtin.recommendations",
        dataKey: "catalog.recommended_services",
        state: "success",
        value: [{
          skuId: "sku-real",
          categoryId: "cat_01",
          categoryName: "家庭保洁",
          name: "日常保洁",
          unit: "次",
          imageUrl: null,
          priceLabel: null,
        }],
        cache: "miss",
        resolvedAt: now,
      },
      "builtin.nearby": {
        sourceId: "builtin.nearby",
        dataKey: "provider.nearby",
        state: "unavailable",
        error: { code: "missing_adapter", retryable: false },
        resolvedAt: now,
      },
    },
  };
}

describe("P8 dynamic customer home", () => {
  it("creates a request correlation id when randomUUID is unavailable", () => {
    vi.stubGlobal("crypto", {});
    try {
      expect(createHomeDataRequestId()).toMatch(/^home-[a-z0-9]+-[a-z0-9]+$/u);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("registers every closed-contract home component and validates the builtin manifest", () => {
    expect(createHomeComponentRegistry().list()).toEqual([
      "location_header",
      "search_bar",
      "service_grid",
      "promotion_banner",
      "recommend_list",
      "worker_nearby",
      "trust_guarantee",
      "bottom_navigation",
    ]);
    expect(customerSduiPageManifestSchema.safeParse(getBuiltinHomeManifest()).success).toBe(true);
  });

  it("changes content order from the manifest without changing HomePage JSX", () => {
    const original = getBuiltinHomeManifest();
    const reordered = {
      ...original,
      revision: "test-reordered",
      components: original.components.map((component) => {
        if (component.type === "service_grid") return { ...component, order: 50 };
        if (component.type === "trust_guarantee") return { ...component, order: 0 };
        return component;
      }),
    };
    const engine = new HomeCompositionEngine(
      createHomeComponentRegistry(),
      createHomeActionRegistry(),
    );
    const result = engine.compose(reordered);
    const contentTypes = result.nodes
      .filter((node) => node.instance.region === "content")
      .map((node) => node.instance.type);

    expect(result.status).toBe("ready");
    expect(contentTypes[0]).toBe("trust_guarantee");
    expect(contentTypes.at(-1)).toBe("service_grid");
  });

  it("renders Catalog-bound categories with versioned assets and isolates missing optional data", () => {
    const actions = createHomeActionRegistry();
    const composition = new HomeCompositionEngine(
      createHomeComponentRegistry(),
      actions,
    ).compose(getBuiltinHomeManifest());

    render(
      <HomeRenderer
        composition={composition}
        resolveBindings={createHomeRuntimeBindingsResolver(batchForBuiltin(), actions)}
      />,
    );

    expect(screen.getByRole("img", { name: "xlb100" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "查看家庭保洁服务" })
      .querySelector("img")?.getAttribute("src"))
      .toBe("/assets/customer/service-categories/cat-01-v1.png");
    expect(screen.getByRole("button", { name: "查看家庭保洁服务" })
      .getAttribute("title"))
      .toBe("家庭保洁");
    expect(screen.getByText("日常保洁")).toBeTruthy();
    expect(screen.getByLabelText("服务图片暂缺")).toBeTruthy();
    expect(screen.getByText(/附近师傅将在获得定位/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "主要导航" })).toBeTruthy();
  });
});
