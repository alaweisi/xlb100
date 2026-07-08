import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const customerHeaders = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "customer-demo-001",
};

async function createPendingOrder(app: Awaited<ReturnType<typeof buildApp>>) {
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
  return response.json().order as { orderId: string };
}

describe.skipIf(!runDb)("paymentOrder integration", { timeout: 15000 }, () => {
  it("creates payment_order for pending order", async () => {
    const app = await buildApp();
    const order = await createPendingOrder(app);
    const response = await app.inject({
      method: "POST",
      url: "/api/payments/orders",
      headers: customerHeaders,
      payload: { orderId: order.orderId },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.ok).toBe(true);
    expect(body.paymentOrder.status).toBe("pending");
    expect(body.paymentOrder.provider).toBe("mock");
    expect(body.paymentOrder.amount).toBe(89);
    expect(body.paymentOrder.metadata.skuId).toBe("sku_home_daily_2h");
    await app.close();
  });
});
