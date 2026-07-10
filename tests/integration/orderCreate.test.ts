import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const customerHeaders = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" });

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
        ...serviceAddressSchedulePayload,
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.order.cityCode).toBe("hangzhou");
    expect(body.order.skuId).toBe("sku_home_daily_2h");
    expect(body.order.status).toBe("pending_dispatch");
    expect(body.order.priceText).toBe("¥89/2小时");
    expect(body.order.priceRuleId).toBe("price_hangzhou_sku_home_daily_2h");
    expect(body.order.totalAmount).toBe(89);
    expect(body.order.quoteSnapshot.priceRuleId).toBe("price_hangzhou_sku_home_daily_2h");
    expect(body.order.quoteSnapshot.breakdown.totalAmount).toBe(89);
    expect(body.order.quoteSnapshot.breakdown.feeItems.length).toBeGreaterThan(0);
    expect(body.order.addressDistrict).toBe("西湖区");
    expect(body.order.detailAddress).toBe("喜乐帮演示小区 3 栋 502");
    expect(body.order.scheduledTimeSlot).toBe("morning");
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
        ...serviceAddressSchedulePayload,
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
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001" }),
      payload: {
        customerId: "customer-demo-001",
        skuId: "sku_home_daily_2h",
        quantity: 1,
        ...serviceAddressSchedulePayload,
      },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });
});
