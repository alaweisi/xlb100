import { beforeEach, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentNoOrderPaymentMutation", { timeout: 30000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("does not create payment or mark order paid during start and complete", async () => {
    const app = await buildApp();
    const { fulfillmentId, orderId } = await createAcceptedFulfillment(app);
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: {} });
    const [rows] = await getMysqlPool().query<(RowDataPacket & { order_status: string; payment_status: string })[]>(
      `SELECT o.status AS order_status, p.status AS payment_status
       FROM orders o LEFT JOIN payment_orders p ON p.order_id = o.order_id AND p.city_code = o.city_code
       WHERE o.order_id = ?`,
      [orderId],
    );
    expect(rows[0]).toMatchObject({ order_status: "pending_dispatch", payment_status: null });
    await app.close();
  });
});
