import type { FastifyInstance } from "fastify";
import { XLB_HEADERS } from "@xlb/types";
import { assertResponseJson } from "./httpResponseTestHelper";

export const customerHeaders = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
};

export const operatorHeaders = {
  [XLB_HEADERS.appType]: "admin",
  [XLB_HEADERS.role]: "operator",
  [XLB_HEADERS.cityCode]: "hangzhou",
};

export async function createPaidOrderForDispatch(app: FastifyInstance): Promise<string> {
  const orderRes = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: customerHeaders,
    payload: {
      customerId: "customer-dispatch-001",
      skuId: "sku_home_daily_2h",
      quantity: 1,
    },
  });
  const order = assertResponseJson<{ order: { orderId: string } }>(orderRes, "POST /api/orders", [200]).order;
  if (!order.orderId) {
    throw new Error("createPaidOrderForDispatch: orderId missing from /api/orders response");
  }

  const payRes = await app.inject({
    method: "POST",
    url: "/api/payments/orders",
    headers: customerHeaders,
    payload: { orderId: order.orderId },
  });
  const paymentOrderId = assertResponseJson<{ paymentOrder: { paymentOrderId: string } }>(
    payRes,
    "POST /api/payments/orders",
    [200],
  ).paymentOrder.paymentOrderId;
  if (!paymentOrderId) {
    throw new Error("createPaidOrderForDispatch: paymentOrderId missing from /api/payments/orders response");
  }

  const webhookRes = await app.inject({
    method: "POST",
    url: "/api/payments/mock-webhook",
    headers: customerHeaders,
    payload: {
      paymentOrderId,
      providerTradeNo: `mock-trade-dispatch-${Date.now()}`,
      status: "paid",
    },
  });
  if (webhookRes.statusCode !== 200) {
    throw new Error(`createPaidOrderForDispatch: POST /api/payments/mock-webhook returned status ${webhookRes.statusCode}`);
  }

  return order.orderId;
}
