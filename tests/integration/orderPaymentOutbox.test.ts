import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const customerHeaders = {
  [XLB_HEADERS.appType]: "customer",
  [XLB_HEADERS.role]: "customer",
  [XLB_HEADERS.cityCode]: "hangzhou",
};

describe.skipIf(!runDb)("orderPaymentOutbox integration", { timeout: 15000 }, () => {
  it("writes order.created payment.paid order.paid to event_outbox", async () => {
    const app = await buildApp();

    const orderRes = await app.inject({
      method: "POST",
      url: "/api/orders",
      headers: customerHeaders,
      payload: {
        customerId: "customer-demo-001",
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
        providerTradeNo: "mock-trade-outbox",
        status: "paid",
      },
    });

    const pool = getMysqlPool();
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
    expect(types).toContain("order.paid");
    expect(rows.every((r) => r.city_code === "hangzhou")).toBe(true);
    expect(rows.every((r) => r.status === "pending")).toBe(true);

    await app.close();
  });
});
