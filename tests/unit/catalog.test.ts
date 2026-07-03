import { describe, it, expect } from "vitest";
import type { RequestContext } from "@xlb/types";
import { catalogService } from "../../backend/src/catalog/catalogService.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

function context(cityCode: string): RequestContext {
  return {
    traceId: "t1",
    appType: "customer",
    role: "customer",
    cityCode: cityCode as RequestContext["cityCode"],
    requestStartedAt: new Date().toISOString(),
  };
}

describe.skipIf(!runDb)("catalogService", () => {
  it("returns official catalog for hangzhou with 16 categories", async () => {
    const catalog = await catalogService.getCatalog(context("hangzhou"));
    expect(catalog.cityCode).toBe("hangzhou");
    expect(catalog.categories.length).toBe(16);
    expect(catalog.categories.every((c) => c.categoryId.startsWith("cat_"))).toBe(true);
    expect(catalog.categories.some((c) => c.categoryId === "demo_cleaning_category")).toBe(false);
  });

  it("shanghai catalog is city-scoped", async () => {
    const catalog = await catalogService.getCatalog(context("shanghai"));
    expect(catalog.cityCode).toBe("shanghai");
    expect(catalog.categories.every((c) => c.cityCode === "shanghai")).toBe(true);
  });
});

describe("catalogService (no DB)", () => {
  it("requires cityCode", async () => {
    const ctx: RequestContext = {
      traceId: "t",
      appType: "customer",
      role: "customer",
      requestStartedAt: new Date().toISOString(),
    };
    await expect(catalogService.getCatalog(ctx)).rejects.toThrow(/city_code/);
  });
});
