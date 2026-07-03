import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("noGlobalPricing", () => {
  it("rejects __global__ as pricing cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "GET",
      url: "/api/pricing/quote?skuId=demo_cleaning_sku",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "__global__",
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
