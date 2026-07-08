import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { customerHeaders } from "./helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";
import { workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

async function createConfirmedOrder(app: Awaited<ReturnType<typeof buildApp>>) {
  const accepted = await createAcceptedFulfillment(app);
  await app.inject({
    method: "POST",
    url: `/api/worker/fulfillments/${accepted.fulfillmentId}/start`,
    headers: workerHangzhouHeaders,
    payload: {},
  });
  await app.inject({
    method: "POST",
    url: `/api/worker/fulfillments/${accepted.fulfillmentId}/complete`,
    headers: workerHangzhouHeaders,
    payload: {},
  });
  await app.inject({
    method: "POST",
    url: `/api/orders/${accepted.orderId}/confirm-service`,
    headers: customerHeaders,
    payload: {},
  });
  return { orderId: accepted.orderId };
}

describe.skipIf(!runDb)("paymentOrder integration", { timeout: 15000 }, () => {
  it("creates payment_order for confirmed completed service order", async () => {
    const app = await buildApp();
    const order = await createConfirmedOrder(app);
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
