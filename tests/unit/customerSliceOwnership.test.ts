import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CustomerFeatureRouteRegistry,
  defineCustomerSlice,
  orchestrationPolicy,
  type CustomerFeatureRouteModule,
} from "../../apps/customer/src/platform/slices/index.js";

const root = process.cwd();
const RouteComponent = () => null;

function routeModule(
  featureId: string,
  ownedDirectory: `apps/customer/src/features/${string}`,
  pattern: "/" | `/${string}`,
  id: `CSL-${number}`,
): CustomerFeatureRouteModule {
  const slice = defineCustomerSlice({
    id,
    featureId,
    routePatterns: [pattern],
    orchestration: orchestrationPolicy(featureId === "home" ? "L3" : "L1"),
    templateId: featureId === "home"
      ? "CustomerSduiPageTemplate"
      : "CustomerOrderDetailTemplate",
    guards: featureId === "home"
      ? []
      : ["session", "city", "protected-route"],
  });

  return {
    featureId,
    ownedDirectories: [ownedDirectory],
    routes: [{
      slice,
      async load() {
        return { RouteComponent };
      },
    }],
  };
}

describe("Customer B0 route and directory ownership", () => {
  it("registers feature-owned routes before BI assembles App.tsx", () => {
    const home = routeModule(
      "home",
      "apps/customer/src/features/home",
      "/",
      "CSL-04",
    );
    const orders = routeModule(
      "orders",
      "apps/customer/src/features/orders",
      "/orders/:orderId",
      "CSL-10",
    );
    const registry = new CustomerFeatureRouteRegistry()
      .register(home)
      .register(orders)
      .seal();

    expect(registry.resolve("/")?.slice.id).toBe("CSL-04");
    expect(registry.resolve("/orders/:orderId")?.slice.id).toBe("CSL-10");
    expect(registry.ownerOfDirectory("apps/customer/src/features/orders")).toBe("orders");
    expect(registry.listModules()).toHaveLength(2);
  });

  it("rejects route collisions and overlapping directory ownership", () => {
    const registry = new CustomerFeatureRouteRegistry().register(routeModule(
      "orders",
      "apps/customer/src/features/orders",
      "/orders/:orderId",
      "CSL-10",
    ));

    expect(() => registry.register(routeModule(
      "aftersale",
      "apps/customer/src/features/aftersale",
      "/orders/:id",
      "CSL-13",
    ))).toThrow(/collides with \/orders\/:orderId owned by orders/);

    expect(() => registry.register(routeModule(
      "order-history",
      "apps/customer/src/features/orders",
      "/orders",
      "CSL-09",
    ))).toThrow(/overlaps apps\/customer\/src\/features\/orders owned by orders/);
  });

  it("rejects ownership outside apps/customer/src/features", () => {
    const invalid = routeModule(
      "checkout",
      "apps/customer/src/features/checkout",
      "/checkout/:skuId",
      "CSL-07",
    ) as {
      featureId: string;
      ownedDirectories: readonly `apps/customer/src/features/${string}`[];
      routes: CustomerFeatureRouteModule["routes"];
    };

    invalid.ownedDirectories = [
      "apps/customer/src/features/../app" as `apps/customer/src/features/${string}`,
    ];

    expect(() => new CustomerFeatureRouteRegistry().register(invalid)).toThrow(
      /invalid owned directory/,
    );
  });

  it("keeps Home on the established P10 SDUI runtime", () => {
    const app = readFileSync(join(root, "apps/customer/src/app/App.tsx"), "utf8");
    const homePage = readFileSync(
      join(root, "apps/customer/src/features/home/HomePage.tsx"),
      "utf8",
    );
    const homeRuntime = readFileSync(
      join(root, "apps/customer/src/features/home/homeRuntime.ts"),
      "utf8",
    );

    expect(app).toContain('import { CustomerAppRouter } from "../routes/CustomerAppRouter.js"');
    expect(app).toContain("<CustomerAppRouter />");
    expect(app).not.toContain("CustomerFeatureRouteRegistry");
    expect(homePage).toContain("HomeCompositionEngine");
    expect(homePage).toContain("HomeRenderer");
    expect(homeRuntime).toContain("HomeManifestDelivery");
    expect(homeRuntime).toContain("HomeDataCoordinator");
    expect(homeRuntime).toContain("createHomeActionRegistry");
  });

  it("documents integration ownership of the final route tree", () => {
    const routesReadme = readFileSync(
      join(root, "apps/customer/src/routes/README.md"),
      "utf8",
    );

    expect(routesReadme).toContain("integration window owns final App route assembly");
    expect(routesReadme).toContain("15 combined feature modules");
    expect(routesReadme).toContain("20 templates");
    expect(routesReadme).toContain("26 published route patterns");
    expect(routesReadme).toContain("apps/customer/src/features/**");
    expect(routesReadme).toContain("app/**");
    expect(routesReadme).toContain("platform/**");
  });
});
