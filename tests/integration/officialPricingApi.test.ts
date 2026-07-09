import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { bearerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("officialPricingApi integration", () => {
  it("GET /api/pricing/quote returns priceText for official sku", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=sku_home_daily_2h",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
        [XLB_HEADERS.cityCode]: "hangzhou",
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.quote.cityCode).toBe("hangzhou");
    expect(body.quote.skuId).toBe("sku_home_daily_2h");
    expect(body.quote.priceText).toBe("¥89/2小时");
    expect(body.quote.priceType).toBe("fixed");
    expect(body.quote.basePrice).toBe(89);
    expect(body.quote.priceRuleId).toBe("price_hangzhou_sku_home_daily_2h");
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=sku_home_daily_2h",
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
      url: "/api/pricing/quote?skuId=sku_home_daily_2h",
      headers: {
        ...bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
        [XLB_HEADERS.cityCode]: "__global__",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
