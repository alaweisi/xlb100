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

async function createOrderAndPayment(app: Awaited<ReturnType<typeof buildApp>>) {
  const orderRes = await app.inject({
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
  const order = orderRes.json().order as { orderId: string };
  const payRes = await app.inject({
    method: "POST",
    url: "/api/payments/orders",
    headers: customerHeaders,
    payload: { orderId: order.orderId },
  });
  const paymentOrder = payRes.json().paymentOrder as { paymentOrderId: string };
  return { orderId: order.orderId, paymentOrderId: paymentOrder.paymentOrderId };
}

describe.skipIf(!runDb)("mockPaymentWebhook integration", { timeout: 15000 }, () => {
  it("marks payment and order paid", async () => {
    const app = await buildApp();
    const { orderId, paymentOrderId } = await createOrderAndPayment(app);

    const webhook = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: customerHeaders,
      payload: {
        paymentOrderId,
        providerTradeNo: "mock-trade-001",
        status: "paid",
      },
    });
    expect(webhook.statusCode).toBe(200);
    expect(webhook.json().paymentOrder.status).toBe("paid");

    const orderGet = await app.inject({
      method: "GET",
      url: `/api/orders/${orderId}`,
      headers: customerHeaders,
    });
    expect(orderGet.json().order.status).toBe("paid");
    await app.close();
  });

  it("is idempotent on duplicate webhook", async () => {
    const app = await buildApp();
    const { paymentOrderId } = await createOrderAndPayment(app);
    const payload = {
      paymentOrderId,
      providerTradeNo: "mock-trade-002",
      status: "paid" as const,
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: customerHeaders,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: customerHeaders,
      payload,
    });
    expect(first.json().idempotent).toBe(false);
    expect(second.json().idempotent).toBe(true);
    await app.close();
  });
});
