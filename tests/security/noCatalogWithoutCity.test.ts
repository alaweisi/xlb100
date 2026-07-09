import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";

describe("noCatalogWithoutCity", () => {
  it("GET /api/catalog returns 400 without cityCode header", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    await app.close();
  });
});
