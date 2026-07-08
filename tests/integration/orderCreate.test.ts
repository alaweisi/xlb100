import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const customerHeaders = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "customer-demo-001",
};

describe.skipIf(!runDb)("orderCreate integration", { timeout: 15000 }, () => {
  it("creates order with official sku and price snapshot", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: customerHeaders,
      payload: {
        customerId: "customer-demo-001",
        skuId: "sku_home_daily_2h",
        quantity: 1,
      },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.order.cityCode).toBe("hangzhou");
    expect(body.order.skuId).toBe("sku_home_daily_2h");
    expect(body.order.status).toBe("pending_payment");
    expect(body.order.priceText).toBe("¥89/2小时");
    expect(body.order.priceRuleId).toBe("price_hangzhou_sku_home_daily_2h");
    expect(body.order.totalAmount).toBe(89);
    await app.close();
  });

  it("rejects demo_cleaning_sku", async () => {
    const app = await buildApp();
    const response = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: customerHeaders,
      payload: {
        customerId: "customer-demo-001",
        skuId: "demo_cleaning_sku",
        quantity: 1,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
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
});
