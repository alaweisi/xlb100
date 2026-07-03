import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

describe("noOrderWithoutCity", () => {
  it("POST /api/orders returns 400 without cityCode", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
      },
      payload: {
        customerId: "customer-demo-001",
        skuId: "sku_home_daily_2h",
        quantity: 1,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("POST /api/orders returns 400 for __global__", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "__global__",
      },
      payload: {
        customerId: "customer-demo-001",
        skuId: "sku_home_daily_2h",
        quantity: 1,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
