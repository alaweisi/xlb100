import type { FastifyInstance } from "fastify";
import { XLB_HEADERS } from "@xlb/types";
import { assertResponseJson } from "./httpResponseTestHelper";
import { serviceAddressSchedulePayload } from "./orderTestPayload";

export const customerHeaders = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "customer-dispatch-001",
};

export const operatorHeaders = {
  [XLB_HEADERS.appType]: "admin",
  [XLB_HEADERS.role]: "operator",
  [XLB_HEADERS.cityCode]: "hangzhou",
};

export async function createOrderForDispatch(
  app: FastifyInstance,
  skuId = "sku_home_daily_2h",
): Promise<string> {
  const orderRes = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers: customerHeaders,
    payload: {
      customerId: "customer-dispatch-001",
      skuId,
      quantity: 1,
      ...serviceAddressSchedulePayload,
    },
  });
  const order = assertResponseJson<{ order: { orderId: string } }>(orderRes, "POST /api/orders", [200]).order;
  if (!order.orderId) {
    throw new Error("createOrderForDispatch: orderId missing from /api/orders response");
  }

  return order.orderId;
}

export const createPaidOrderForDispatch = createOrderForDispatch;
