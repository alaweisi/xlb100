// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  customerEntryFeatureRouteModule,
} from "../../apps/customer/src/features/shell/customerEntryFeatureRouteModule.js";
import {
  createHomeActionRegistry,
  createHomeComponentRegistry,
  customerHomeFeatureRouteModule,
  customerHomeSlice,
  customerHomeTemplateRegistration,
  CustomerHomeRoute,
  CustomerSduiPageTemplate,
} from "../../apps/customer/src/features/home/index.js";
import {
  CustomerFeatureRouteRegistry,
  CustomerTemplateRegistry,
} from "../../apps/customer/src/platform/slices/index.js";
import {
  HomeDataAdapterRegistry,
  registerCustomerHomeDataAdapters,
} from "../../apps/customer/src/platform/sdui/data/index.js";

const root = process.cwd();

describe("Customer CSL-04 Home slice bridge", () => {
  it("publishes the root route as an L3 customer.home template without final assembly", async () => {
    expect(customerHomeSlice).toMatchObject({
      id: "CSL-04",
      featureId: "home",
      routePatterns: ["/"],
      orchestration: {
        level: "L3",
        operationalManifest: "sdui",
      },
      templateId: "CustomerSduiPageTemplate",
      guards: [],
    });
    expect(customerHomeTemplateRegistration).toMatchObject({
      templateId: "CustomerSduiPageTemplate",
      orchestrationLevel: "L3",
      operationalManifest: "sdui",
      component: CustomerSduiPageTemplate,
    });

    const routeRegistry = new CustomerFeatureRouteRegistry()
      .register(customerEntryFeatureRouteModule)
      .register(customerHomeFeatureRouteModule)
      .seal();
    const templateRegistry = new CustomerTemplateRegistry()
      .register(customerHomeTemplateRegistration)
      .seal();

    expect(routeRegistry.resolve("/")?.slice).toBe(customerHomeSlice);
    expect(routeRegistry.ownerOfDirectory("apps/customer/src/features/home")).toBe("home");
    expect(templateRegistry.resolveForSlice(customerHomeSlice))
      .toEqual(customerHomeTemplateRegistration);
    await expect(routeRegistry.resolve("/")?.load()).resolves.toMatchObject({
      RouteComponent: CustomerHomeRoute,
    });
  });

  it("keeps production and route-window Home rendering on the single P10 runtime", () => {
    const app = readFileSync(
      join(root, "apps/customer/src/app/App.tsx"),
      "utf8",
    );
    const template = readFileSync(
      join(root, "apps/customer/src/features/home/CustomerSduiPageTemplate.tsx"),
      "utf8",
    );
    const route = readFileSync(
      join(root, "apps/customer/src/features/home/CustomerHomeRoute.tsx"),
      "utf8",
    );

    expect(app).toContain('import { HomePage } from "../features/home/HomePage.js"');
    expect(app).not.toContain("customerHomeFeatureRouteModule");
    expect(template).toContain('import { HomePage } from "./HomePage.js"');
    expect(template).toContain("<HomePage telemetry={telemetry} />");
    expect(template).not.toContain("HomeManifestDelivery");
    expect(template).not.toContain("HomeCompositionEngine");
    expect(template).not.toContain("HomeDataCoordinator");
    expect(route).toContain("operationalManifest={null}");
  });

  it("keeps protected Home components and navigation behind sealed allowlists", () => {
    const components = createHomeComponentRegistry();
    const actions = createHomeActionRegistry();

    expect(components.sealed).toBe(true);
    expect(actions.sealed).toBe(true);
    expect(components.resolve("location_header")?.actionSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot: "location",
          actionKeys: ["location.open_picker"],
          required: true,
        }),
      ]),
    );
    expect(components.resolve("search_bar")?.actionSlots).toEqual([
      {
        slot: "submit",
        actionKeys: ["search.submit"],
        required: true,
      },
    ]);
    expect(components.resolve("bottom_navigation")?.actionSlots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slot: "home",
          actionKeys: ["navigation.open_home"],
          required: true,
        }),
        expect.objectContaining({
          slot: "orders",
          actionKeys: ["navigation.open_orders"],
          required: true,
        }),
      ]),
    );

    const navigated = vi.fn();
    window.addEventListener("xlb:customer:navigate", navigated);
    actions.invoke("location.open_picker", {
      definition: { id: "location", actionKey: "location.open_picker" },
      sourceComponentId: "home-location",
      sourceComponentType: "location_header",
      sourceComponentRegion: "header",
      sourceComponentOrder: 0,
    });
    expect(navigated).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({
        actionKey: "location.open_picker",
        route: "/location",
      }),
    }));
    expect(window.location.pathname).toBe("/location");
    window.removeEventListener("xlb:customer:navigate", navigated);
  });

  it("leaves every GAP-05 data Adapter unregistered", () => {
    const registry = registerCustomerHomeDataAdapters(
      new HomeDataAdapterRegistry(),
      {
        customerApi: {
          getCatalog: vi.fn(),
          getNotificationUnreadCount: vi.fn(),
        },
        getCurrentLocation: vi.fn(),
      },
    );

    expect(registry.list()).toEqual([
      "customer.current_location",
      "customer.notification_summary",
      "catalog.service_categories",
    ]);
    expect(registry.has("catalog.recommended_services")).toBe(false);
    expect(registry.has("provider.nearby")).toBe(false);
    expect(registry.has("content.home_promotions")).toBe(false);
    expect(registry.has("content.trust_guarantees")).toBe(false);

    const runtime = readFileSync(
      join(root, "apps/customer/src/features/home/homeRuntime.ts"),
      "utf8",
    );
    expect(runtime).not.toContain("getRecommendedServices");
    expect(runtime).not.toContain("getNearbyProviders");
    expect(runtime).not.toContain("getHomePromotions");
    expect(runtime).not.toContain("getTrustGuarantees");
  });
});
