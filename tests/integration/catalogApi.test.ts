import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("catalogApi integration", () => {
  it("GET /api/catalog returns city-scoped official catalog", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" }),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.catalog.cityCode).toBe("hangzhou");
    expect(body.catalog.categories.length).toBeGreaterThanOrEqual(16);
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
