import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("officialCatalogApi integration", () => {
  it("GET /api/catalog returns 16 official categories for hangzhou", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
        [XLB_HEADERS.cityCode]: "hangzhou",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.catalog.cityCode).toBe("hangzhou");
    expect(body.catalog.categories.length).toBe(16);
    const ids = body.catalog.categories.map((c: { categoryId: string }) => c.categoryId);
    expect(ids).not.toContain("demo_cleaning_category");
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 for __global__ cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
        [XLB_HEADERS.cityCode]: "__global__",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
