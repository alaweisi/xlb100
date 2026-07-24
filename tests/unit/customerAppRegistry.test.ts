import { describe, expect, it } from "vitest";
import {
  CUSTOMER_APP_FEATURE_ROUTE_MODULES,
  CUSTOMER_APP_TEMPLATE_REGISTRATIONS,
  createCustomerAppRouteAssembly,
} from "../../apps/customer/src/routes/customerAppRegistry.js";

describe("Customer BI route registry", () => {
  it("seals the unique 20-slice, 15-module, 20-template, 26-pattern assembly", () => {
    const assembly = createCustomerAppRouteAssembly();
    const ids = assembly.slices.map((slice) => slice.id).sort();
    const expectedIds = Array.from({ length: 20 }, (_, index) =>
      `CSL-${String(index + 1).padStart(2, "0")}`
    );

    expect(ids).toEqual(expectedIds);
    expect(new Set(ids)).toHaveLength(20);
    expect(CUSTOMER_APP_FEATURE_ROUTE_MODULES).toHaveLength(15);
    expect(assembly.featureRegistry.listModules()).toHaveLength(15);
    expect(CUSTOMER_APP_TEMPLATE_REGISTRATIONS).toHaveLength(20);
    expect(assembly.templateRegistry.list()).toHaveLength(20);
    expect(assembly.routes).toHaveLength(26);
    expect(new Set(assembly.routes.map((route) => route.pattern))).toHaveLength(26);
    expect(assembly.featureRegistry.sealed).toBe(true);
    expect(assembly.templateRegistry.sealed).toBe(true);
    for (const slice of assembly.slices) {
      expect(assembly.templateRegistry.resolveForSlice(slice)?.templateId)
        .toBe(slice.templateId);
    }
  });

  it("keeps Home as the only L3 slice and limits L2 to presentation seams", () => {
    const assembly = createCustomerAppRouteAssembly();
    const byLevel = Object.groupBy(assembly.slices, (slice) => slice.orchestration.level);

    expect(byLevel.L3?.map((slice) => slice.id)).toEqual(["CSL-04"]);
    expect(byLevel.L2?.map((slice) => slice.id).sort()).toEqual([
      "CSL-05",
      "CSL-06",
      "CSL-15",
    ]);
    expect(byLevel.L1).toHaveLength(16);
    expect(byLevel.L1?.every((slice) =>
      slice.orchestration.operationalManifest === "forbidden"
    )).toBe(true);
    expect(byLevel.L2?.every((slice) =>
      slice.orchestration.operationalManifest === "limited"
    )).toBe(true);
  });

  it("uses only combined ownership modules for Service, Orders and Support", () => {
    const assembly = createCustomerAppRouteAssembly();
    const modules = assembly.featureRegistry.listModules();
    const featureIds = modules.map((module) => module.featureId);

    expect(new Set(featureIds)).toHaveLength(15);
    expect(modules.find((module) => module.featureId === "service")?.routes).toHaveLength(2);
    expect(modules.find((module) => module.featureId === "orders")?.routes).toHaveLength(2);
    expect(modules.find((module) => module.featureId === "support")?.routes).toHaveLength(2);
    expect(modules.find((module) => module.featureId === "support")?.routes
      .flatMap((route) => route.slice.routePatterns)).toEqual([
        "/support",
        "/support/tickets",
        "/support/tickets/:ticketId",
        "/support/conversations",
        "/support/conversations/:conversationId",
      ]);
  });
});
