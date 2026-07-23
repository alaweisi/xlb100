// @vitest-environment jsdom
import { customerSduiPageManifestSchema } from "@xlb/validators";
import { describe, expect, it, vi } from "vitest";

import { createHomeActionRegistry } from "../../apps/customer/src/features/home/createHomeActionRegistry";
import {
  HomeDataAdapterRegistry,
  HomeDataCoordinator,
} from "../../apps/customer/src/platform/sdui/data";
import { getBuiltinHomeManifest } from "../../apps/customer/src/platform/sdui/delivery/builtinHomeManifest";

describe("Customer P10 safety boundaries", () => {
  it("returns an explicit empty data state when the manifest requests no sources", async () => {
    const result = await new HomeDataCoordinator(new HomeDataAdapterRegistry()).load({
      requestId: "p10-empty-data",
      cityCode: "hangzhou",
      locale: "zh-CN",
      cacheScopeKey: "city:hangzhou|actor:anonymous",
      dataSources: [],
    });

    expect(result.state).toBe("empty");
    expect(result.results).toEqual({});
    expect(result.issues).toEqual([]);
  });

  it.each([
    ["amountMinor", 1],
    ["orderStatus", "paid"],
    ["catalogItems", [{ skuId: "forged-sku" }]],
  ])("rejects manifest-owned business fact %s", (field, value) => {
    const manifest = structuredClone(getBuiltinHomeManifest());
    const serviceGrid = manifest.components.find((component) => component.type === "service_grid");
    expect(serviceGrid).toBeDefined();
    Object.assign(serviceGrid!.props, { [field]: value });

    expect(customerSduiPageManifestSchema.safeParse(manifest).success).toBe(false);
  });

  it("keeps the business action successful when the telemetry callback fails", () => {
    const navigated = vi.fn();
    window.addEventListener("xlb:customer:navigate", navigated);
    const registry = createHomeActionRegistry({
      onEvent() {
        throw new Error("telemetry sink unavailable");
      },
    });

    expect(() => registry.invoke("navigation.open_orders", {
      definition: { id: "p10-open-orders", actionKey: "navigation.open_orders" },
      sourceComponentId: "home-bottom-navigation",
      sourceComponentType: "bottom_navigation",
      sourceComponentRegion: "footer",
      sourceComponentOrder: 0,
    })).not.toThrow();
    expect(navigated).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe("/orders");

    window.removeEventListener("xlb:customer:navigate", navigated);
  });
});
