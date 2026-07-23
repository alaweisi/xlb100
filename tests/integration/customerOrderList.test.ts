import { describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { OrderService } from "../../backend/src/order/orderService.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const customerA = bearerHeaders({
  appType: "customer",
  role: "customer",
  userId: "customer-demo-001",
  cityCode: "hangzhou",
});
const customerB = bearerHeaders({
  appType: "customer",
  role: "customer",
  userId: "customer-demo-002",
  cityCode: "hangzhou",
});

describe("GAP-01 Customer order list service integration", () => {
  it("integrates scope, pagination policy, repository projection and response validation", async () => {
    const rows = [
      {
        orderId: "order-gap01-new",
        cityCode: "hangzhou",
        skuId: "sku_home_daily_2h",
        skuName: "日常保洁2小时",
        quantity: 1,
        unit: "次",
        scheduledAt: "2026-07-24T12:00:00.000Z",
        scheduledTimeSlot: "morning",
        priceText: "¥89/2小时",
        totalAmount: 89,
        currency: "CNY",
        status: "pending_dispatch",
        createdAt: "2026-07-24T11:00:00.000Z",
        updatedAt: "2026-07-24T11:00:00.000Z",
      },
      {
        orderId: "order-gap01-old",
        cityCode: "hangzhou",
        skuId: "sku_home_daily_2h",
        skuName: "日常保洁2小时",
        quantity: 1,
        unit: "次",
        scheduledAt: "2026-07-24T10:00:00.000Z",
        scheduledTimeSlot: "afternoon",
        priceText: "¥89/2小时",
        totalAmount: 89,
        currency: "CNY",
        status: "pending_dispatch",
        createdAt: "2026-07-24T09:00:00.000Z",
        updatedAt: "2026-07-24T09:00:00.000Z",
      },
    ] as const;
    const listCustomerOrders = vi.fn(async (
      _context: unknown,
      cityCode: string,
      customerId: string,
      filter: string,
      limit: number,
      cursor?: { orderId: string },
    ) => {
      expect(cityCode).toBe("hangzhou");
      expect(customerId).toBe("customer-demo-001");
      expect(filter).toBe("active");
      const start = cursor ? rows.findIndex((item) => item.orderId === cursor.orderId) + 1 : 0;
      return rows.slice(start, start + limit);
    });
    const service = new OrderService({ listCustomerOrders } as never);
    const requestContext = {
      traceId: "trace-gap01-integration",
      appType: "customer" as const,
      role: "customer" as const,
      cityCode: "hangzhou" as const,
      userId: "customer-demo-001",
      requestStartedAt: "2026-07-24T10:00:00.000Z",
    };

    const first = await service.listCustomerOrders(requestContext, { limit: 1, filter: "active" });
    expect(first.items.map((item) => item.orderId)).toEqual(["order-gap01-new"]);
    expect(first.nextCursor).toEqual(expect.any(String));
    const second = await service.listCustomerOrders(requestContext, {
      limit: 1,
      filter: "active",
      cursor: first.nextCursor!,
    });
    expect(second.items.map((item) => item.orderId)).toEqual(["order-gap01-old"]);
    expect(second.nextCursor).toBeNull();
  });
});

async function createOrder(
  app: Awaited<ReturnType<typeof buildApp>>,
  headers: Record<string, string>,
  detailAddress: string,
): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/api/orders",
    headers,
    payload: {
      skuId: "sku_home_daily_2h",
      quantity: 1,
      ...serviceAddressSchedulePayload,
      detailAddress,
    },
  });
  expect(response.statusCode, response.body).toBe(200);
  return response.json().order.orderId as string;
}

describe.skipIf(!runDb)("GAP-01 Customer order list integration", { timeout: 30_000 }, () => {
  it("paginates the authenticated Customer's existing orders without exposing private fields", async () => {
    const app = await buildApp();
    try {
      const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const olderA = await createOrder(app, customerA, `GAP-01 A older ${suffix}`);
      const orderB = await createOrder(app, customerB, `GAP-01 B ${suffix}`);
      const newerA = await createOrder(app, customerA, `GAP-01 A newer ${suffix}`);

      const first = await app.inject({
        method: "GET",
        url: "/api/customer/orders?limit=1&filter=active",
        headers: customerA,
      });
      expect(first.statusCode, first.body).toBe(200);
      const firstBody = first.json();
      expect(firstBody.items).toHaveLength(1);
      expect(firstBody.items[0].orderId).toBe(newerA);
      expect(firstBody.nextCursor).toEqual(expect.any(String));
      expect(firstBody.items[0]).not.toHaveProperty("customerId");
      expect(firstBody.items[0]).not.toHaveProperty("contactPhone");
      expect(firstBody.items[0]).not.toHaveProperty("detailAddress");
      expect(firstBody.items[0]).not.toHaveProperty("quoteSnapshot");

      const second = await app.inject({
        method: "GET",
        url: `/api/customer/orders?limit=50&filter=active&cursor=${encodeURIComponent(firstBody.nextCursor)}`,
        headers: customerA,
      });
      expect(second.statusCode, second.body).toBe(200);
      const secondIds = second.json().items.map((item: { orderId: string }) => item.orderId);
      expect(secondIds).toContain(olderA);
      expect(secondIds).not.toContain(orderB);
    } finally {
      await app.close();
    }
  });
});
