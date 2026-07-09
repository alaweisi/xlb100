import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("pricingApi integration", () => {
  it("GET /api/pricing/quote returns city+sku price with priceText", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=sku_home_daily_2h",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" }),
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.quote.cityCode).toBe("hangzhou");
    expect(body.quote.skuId).toBe("sku_home_daily_2h");
    expect(body.quote.priceText).toBeDefined();
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=demo_cleaning_sku",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
