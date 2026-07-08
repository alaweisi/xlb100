import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { customerHeaders as dispatchCustomerHeaders } from "./helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";
import { workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

async function createConfirmedOrderAndPayment(app: Awaited<ReturnType<typeof buildApp>>) {
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
    headers: dispatchCustomerHeaders,
    payload: {},
  });
  const payRes = await app.inject({
    method: "POST",
    url: "/api/payments/orders",
    headers: dispatchCustomerHeaders,
    payload: { orderId: accepted.orderId },
  });
  const paymentOrder = payRes.json().paymentOrder as { paymentOrderId: string };
  return { orderId: accepted.orderId, paymentOrderId: paymentOrder.paymentOrderId };
}

describe.skipIf(!runDb)("mockPaymentWebhook integration", { timeout: 15000 }, () => {
  it("marks payment and order paid", async () => {
    const app = await buildApp();
    const { orderId, paymentOrderId } = await createConfirmedOrderAndPayment(app);

    const webhook = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: dispatchCustomerHeaders,
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
      headers: dispatchCustomerHeaders,
    });
    expect(orderGet.json().order.status).toBe("paid");
    await app.close();
  });

  it("is idempotent on duplicate webhook", async () => {
    const app = await buildApp();
    const { paymentOrderId } = await createConfirmedOrderAndPayment(app);
    const payload = {
      paymentOrderId,
      providerTradeNo: "mock-trade-002",
      status: "paid" as const,
    };

    const first = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: dispatchCustomerHeaders,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url: "/api/payments/mock-webhook",
      headers: dispatchCustomerHeaders,
      payload,
    });
    expect(first.json().idempotent).toBe(false);
    expect(second.json().idempotent).toBe(true);
    await app.close();
  });
});
