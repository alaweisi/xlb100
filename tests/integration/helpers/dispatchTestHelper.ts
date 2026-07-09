import type { FastifyInstance } from "fastify";
import { assertResponseJson } from "./httpResponseTestHelper";
import { serviceAddressSchedulePayload } from "./orderTestPayload";
import { adminAuthHeaders, bearerHeaders } from "./authTestHelper.js";

export const customerHeaders = bearerHeaders({
  appType: "customer",
  role: "customer",
  userId: "customer-dispatch-001",
  cityCode: "hangzhou",
});

export const operatorHeaders = adminAuthHeaders("operator-hangzhou", "hangzhou");

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
