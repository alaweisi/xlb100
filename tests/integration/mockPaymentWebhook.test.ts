import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { customerHeaders as dispatchCustomerHeaders } from "./helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";
import { workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { withMockPaymentWebhookSecret } from "./helpers/authTestHelper.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";

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
      headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
      payload: {
        paymentOrderId,
        providerTradeNo: `mock-trade-success-${paymentOrderId}`,
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

  it("serializes concurrent duplicate callbacks and emits one paid event", async () => {
    const app = await buildApp();
    const { paymentOrderId } = await createConfirmedOrderAndPayment(app);
    const payload = {
      paymentOrderId,
      providerTradeNo: `mock-trade-concurrent-${paymentOrderId}`,
      status: "paid" as const,
    };

    try {
      const responses = await Promise.all([
        app.inject({
          method: "POST",
          url: "/api/payments/mock-webhook",
          headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
          payload,
        }),
        app.inject({
          method: "POST",
          url: "/api/payments/mock-webhook",
          headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
          payload,
        }),
      ]);
      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(
        responses
          .map((response) => response.json().idempotent as boolean)
          .sort(),
      ).toEqual([false, true]);

      const [rows] = await getMysqlPool().query<
        (RowDataPacket & { event_count: number })[]
      >(
        `SELECT COUNT(*) AS event_count
         FROM event_outbox
         WHERE event_type = 'payment.paid'
           AND aggregate_type = 'payment_order'
           AND aggregate_id = ?`,
        [paymentOrderId],
      );
      expect(Number(rows[0]?.event_count)).toBe(1);
    } finally {
      await app.close();
    }
  });

  it("rejects a different provider trade number after payment is final", async () => {
    const app = await buildApp();
    try {
      const { paymentOrderId } = await createConfirmedOrderAndPayment(app);
      const first = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
        payload: {
          paymentOrderId,
          providerTradeNo: `mock-trade-original-${paymentOrderId}`,
          status: "paid",
        },
      });
      expect(first.statusCode).toBe(200);

      const conflicting = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
        payload: {
          paymentOrderId,
          providerTradeNo: `mock-trade-conflict-${paymentOrderId}`,
          status: "paid",
        },
      });
      expect(conflicting.statusCode).toBe(409);
      expect(conflicting.json().error).toContain("different provider trade number");
    } finally {
      await app.close();
    }
  });

  it("does not allow one provider trade number to pay two payment orders", async () => {
    const app = await buildApp();
    try {
      const firstPayment = await createConfirmedOrderAndPayment(app);
      const secondPayment = await createConfirmedOrderAndPayment(app);
      const providerTradeNo = `mock-trade-unique-${firstPayment.paymentOrderId}`;
      const first = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
        payload: {
          paymentOrderId: firstPayment.paymentOrderId,
          providerTradeNo,
          status: "paid",
        },
      });
      expect(first.statusCode).toBe(200);

      const second = await app.inject({
        method: "POST",
        url: "/api/payments/mock-webhook",
        headers: withMockPaymentWebhookSecret(dispatchCustomerHeaders),
        payload: {
          paymentOrderId: secondPayment.paymentOrderId,
          providerTradeNo,
          status: "paid",
        },
      });
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toContain("already bound");

      const [rows] = await getMysqlPool().query<
        (RowDataPacket & { status: string; provider_trade_no: string | null })[]
      >(
        `SELECT status, provider_trade_no
         FROM payment_orders
         WHERE payment_order_id = ?`,
        [secondPayment.paymentOrderId],
      );
      expect(rows[0]).toMatchObject({ status: "pending", provider_trade_no: null });
    } finally {
      await app.close();
    }
  });
});
