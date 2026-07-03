import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("pricingApi integration", () => {
  it("GET /api/pricing/quote returns city+sku price", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=demo_cleaning_sku",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "hangzhou",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.quote.cityCode).toBe("hangzhou");
    expect(body.quote.skuId).toBe("demo_cleaning_sku");
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
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
    await app.close();
  });
});
