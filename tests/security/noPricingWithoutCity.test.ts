import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

describe("noPricingWithoutCity", () => {
  it("GET /api/pricing/quote returns 400 without cityCode header", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=demo_cleaning_sku",
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
