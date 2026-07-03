import type { FastifyInstance } from "fastify";
import { XLB_HEADERS } from "@xlb/types";

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
  const order = orderRes.json().order as { orderId: string };

  const payRes = await app.inject({
    method: "POST",
    url: "/api/payments/orders",
    headers: customerHeaders,
    payload: { orderId: order.orderId },
  });
  const paymentOrderId = payRes.json().paymentOrder.paymentOrderId as string;

  await app.inject({
    method: "POST",
    url: "/api/payments/mock-webhook",
    headers: customerHeaders,
    payload: {
      paymentOrderId,
      providerTradeNo: `mock-trade-dispatch-${Date.now()}`,
      status: "paid",
    },
  });

  return order.orderId;
}
