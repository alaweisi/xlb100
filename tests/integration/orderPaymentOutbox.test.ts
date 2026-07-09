import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { adminAuthHeaders, workerAuthHeaders, bearerHeaders } from "./helpers/authTestHelper.js";
import { serviceAddressSchedulePayload } from "./helpers/orderTestPayload";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const customerHeaders = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-001", cityCode: "hangzhou" });
const operatorHeaders = adminAuthHeaders("operator-hangzhou", "hangzhou");
const workerHeaders = workerAuthHeaders("worker-demo-hangzhou", "hangzhou");

describe.skipIf(!runDb)("orderPaymentOutbox integration", { timeout: 15000 }, () => {
  it("writes order.created and post-service payment.paid to event_outbox", async () => {
    const app = await buildApp();

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

    const pool = getMysqlPool();
    let dispatchTaskId: string | undefined;
    for (let i = 0; i < 50; i++) {
      await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/run-once",
        headers: operatorHeaders,
        payload: {},
      });
      const [tasks] = await pool.query<(RowDataPacket & { dispatch_task_id: string })[]>(
        `SELECT dispatch_task_id FROM dispatch_tasks WHERE order_id = ? AND status = 'queued' LIMIT 1`,
        [order.orderId],
      );
      if (tasks[0]?.dispatch_task_id) {
        dispatchTaskId = tasks[0].dispatch_task_id;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(dispatchTaskId).toBeTruthy();
    const acceptRes = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHeaders,
      payload: {},
    });
    const fulfillmentId = acceptRes.json().fulfillment.fulfillmentId as string;
    await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/start`,
      headers: workerHeaders,
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHeaders,
      payload: {},
    });
    await app.inject({
      method: "POST",
      url: `/api/orders/${order.orderId}/confirm-service`,
      headers: customerHeaders,
      payload: {},
    });

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
        providerTradeNo: "mock-trade-outbox",
        status: "paid",
      },
    });

    const [rows] = await pool.query<
      (RowDataPacket & { event_type: string; city_code: string; status: string })[]
    >(
      `SELECT event_type, city_code, status FROM event_outbox
       WHERE aggregate_id IN (?, ?) OR aggregate_id = ?
       ORDER BY created_at ASC`,
      [order.orderId, paymentOrderId, order.orderId],
    );

    const types = rows.map((r) => r.event_type);
    expect(types).toContain("order.created");
    expect(types).toContain("payment.paid");
    expect(types).not.toContain("order.paid");
    expect(rows.every((r) => r.city_code === "hangzhou")).toBe(true);
    expect(rows.some((r) => r.event_type === "order.created" && r.status === "published")).toBe(true);
    expect(rows.some((r) => r.event_type === "payment.paid" && r.status === "pending")).toBe(true);

    await app.close();
  });
});
