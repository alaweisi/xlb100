import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { loginAdminHeaders, loginCustomerHeaders, loginWorkerHeaders } from "./helpers/authTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

describe.skipIf(!runDb)("Phase 23D authenticated Worker lifecycle E2E", { timeout: 90_000 }, () => {
  it("authenticates all actors and closes order, accept, evidence, and fulfillment through real APIs", async () => {
    const app = await buildApp();
    const pool = getMysqlPool();
    try {
      const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 7)}`;
      const customerId = `customer-phase23d-${suffix}`;
      const customerHeaders = await loginCustomerHeaders(app, {
        userId: customerId,
        phone: `13823${Date.now().toString().slice(-6)}`,
        cityCode: "hangzhou",
      });
      const workerHeaders = await loginWorkerHeaders(app, {
        userId: "worker-demo-hangzhou",
        phone: "13800000001",
        cityCode: "hangzhou",
      });
      const operatorHeaders = await loginAdminHeaders(app, {
        userId: `operator-phase23d-${suffix}`,
        username: `operator_phase23d_${suffix}`,
        role: "operator",
        cityCode: "hangzhou",
      });
      await ensureHangzhouWorkerEligible();

      const orderResponse = await app.inject({
        method: "POST",
        url: "/api/orders",
        headers: customerHeaders,
        payload: {
          customerId,
          skuId: "sku_home_daily_2h",
          quantity: 1,
          addressProvince: "Zhejiang",
          addressCity: "Hangzhou",
          addressDistrict: "Xihu",
          detailAddress: `Phase 23D authenticated lifecycle ${suffix}`,
          contactName: "Phase 23D Customer",
          contactPhone: "13800000001",
          scheduledAt: "2026-07-20T02:00:00.000Z",
          scheduledTimeSlot: "morning",
        },
      });
      expect(orderResponse.statusCode, orderResponse.body).toBe(200);
      const orderId = orderResponse.json().order.orderId as string;

      let dispatchTaskId = "";
      for (let attempt = 0; attempt < 20 && !dispatchTaskId; attempt += 1) {
        const run = await app.inject({ method: "POST", url: "/api/internal/dispatch/run-once", headers: operatorHeaders, payload: {} });
        expect(run.statusCode, run.body).toBe(200);
        const [rows] = await pool.query<(RowDataPacket & { dispatch_task_id: string })[]>(
          "SELECT dispatch_task_id FROM dispatch_tasks WHERE city_code='hangzhou' AND order_id=? AND status='queued' LIMIT 1",
          [orderId],
        );
        dispatchTaskId = rows[0]?.dispatch_task_id ?? "";
      }
      expect(dispatchTaskId).not.toBe("");

      const poolResponse = await app.inject({ method: "GET", url: "/api/worker/task-pool", headers: workerHeaders });
      expect(poolResponse.statusCode, poolResponse.body).toBe(200);
      expect(poolResponse.json().tasks).toEqual(expect.arrayContaining([
        expect.objectContaining({ dispatchTaskId, orderId, cityCode: "hangzhou", status: "queued" }),
      ]));

      const crossCityHeaders = { ...workerHeaders, "x-xlb-city-code": "shanghai" };
      const crossCityPool = await app.inject({ method: "GET", url: "/api/worker/task-pool", headers: crossCityHeaders });
      expect([403, 404]).toContain(crossCityPool.statusCode);

      const accepted = await app.inject({
        method: "POST",
        url: `/api/worker/tasks/${dispatchTaskId}/accept`,
        headers: workerHeaders,
        payload: {},
      });
      expect(accepted.statusCode, accepted.body).toBe(200);
      const fulfillmentId = accepted.json().fulfillment.fulfillmentId as string;

      const started = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHeaders, payload: {} });
      expect(started.statusCode, started.body).toBe(200);
      expect(started.json().fulfillment.status).toBe("in_progress");

      const evidence = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=after_service&note=phase23d-e2e`,
        headers: { ...workerHeaders, "content-type": "image/png", "x-file-name": "phase23d-e2e.png" },
        payload: png,
      });
      expect(evidence.statusCode, evidence.body).toBe(200);
      expect(evidence.json().evidence.mediaAsset.storage).toMatchObject({
        providerStatus: "stored_local",
        externalProviderExecuted: false,
      });

      const completed = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
        headers: workerHeaders,
        payload: { completionNote: "Phase 23D lifecycle complete" },
      });
      expect(completed.statusCode, completed.body).toBe(200);
      expect(completed.json().fulfillment.status).toBe("completed");

      const confirmed = await app.inject({
        method: "POST",
        url: `/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`,
        headers: customerHeaders,
        payload: { decision: "confirmed", note: "Phase 23D customer accepted" },
      });
      expect(confirmed.statusCode, confirmed.body).toBe(200);

      const [invariants] = await pool.query<(RowDataPacket & {
        fulfillment_status: string;
        city_code: string;
        evidence_count: number;
        external_runs: number;
        completion_events: number;
      })[]>(
        `SELECT f.status fulfillment_status,f.city_code,
                COUNT(DISTINCT e.evidence_id) evidence_count,
                SUM(COALESCE(m.external_provider_executed,0)) external_runs,
                COUNT(DISTINCT o.event_id) completion_events
           FROM fulfillments f
           LEFT JOIN fulfillment_evidence e ON e.city_code=f.city_code AND e.fulfillment_id=f.fulfillment_id
           LEFT JOIN media_assets m ON m.city_code=e.city_code AND m.media_asset_id=e.media_asset_id
           LEFT JOIN event_outbox o ON o.city_code=f.city_code AND o.aggregate_id=f.fulfillment_id AND o.event_type='fulfillment.completed'
          WHERE f.city_code='hangzhou' AND f.fulfillment_id=?
          GROUP BY f.fulfillment_id,f.status,f.city_code`,
        [fulfillmentId],
      );
      expect(invariants[0]).toMatchObject({
        fulfillment_status: "completed",
        city_code: "hangzhou",
        evidence_count: 1,
        completion_events: 1,
      });
      expect(Number(invariants[0]?.external_runs)).toBe(0);
    } finally {
      await app.close();
    }
  });
});
