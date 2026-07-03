import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

describe("noCatalogWithoutCity", () => {
  it("GET /api/catalog returns 400 without cityCode header", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/catalog",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
      },
    });
    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.ok).toBe(false);
    await app.close();
  });
});
