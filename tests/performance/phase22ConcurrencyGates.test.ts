import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { createQueuedDispatchTask, ensureAltHangzhouWorkerBound, ensureHangzhouWorkerEligible, workerHangzhouAltHeaders, workerHangzhouHeaders } from "../integration/helpers/acceptTestHelper.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";
import { operatorHeaders } from "../integration/helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const offerBudgetMs = Number(process.env.XLB_PHASE22_OFFER_RACE_MAX_MS ?? 8_000);
const webhookBudgetMs = Number(process.env.XLB_PHASE22_WEBHOOK_STORM_MAX_MS ?? 10_000);
const adminHeaders = bearerHeaders({ appType: "admin", role: "operator", userId: "phase22-performance", cityCode: "hangzhou" });
const keyHeaders = (key: string) => ({ "x-xlb-api-key": key });

describe.skipIf(!runDb)("Phase 22 concurrency and performance gates", { timeout: 120_000 }, () => {
  it("keeps one acceptance under a 40-request two-worker offer race", async () => {
    if (process.env.XLB_PHASE22_FORCE_FAILURE === "performance") throw new Error("intentional Phase 22 performance gate failure");
    const app = await buildApp();
    const pool = getMysqlPool();
    try {
      await ensureHangzhouWorkerEligible();
      await ensureAltHangzhouWorkerBound();
      await pool.query("INSERT INTO worker_online_status(worker_id,city_code,is_online) VALUES('worker-demo-hangzhou','hangzhou',1),('worker-demo-hangzhou-alt','hangzhou',1) ON DUPLICATE KEY UPDATE is_online=1");
      await pool.query("UPDATE worker_profiles SET status='active',dispatch_status='available',is_certified=1 WHERE worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt')");
      await pool.query("INSERT INTO worker_qualifications(worker_id,city_code,sku_id,is_eligible,source_certification_id) VALUES('worker-demo-hangzhou-alt','hangzhou','sku_home_daily_2h',1,NULL) ON DUPLICATE KEY UPDATE is_eligible=1");
      const fresh = new Date().toISOString();
      for (const [headers, latitude] of [[workerHangzhouHeaders, 30.2831], [workerHangzhouAltHeaders, 30.29]] as const) {
        const location = await app.inject({ method: "POST", url: "/api/worker/location", headers, payload: { latitude, longitude: 120.1551, accuracyMeters: 12, capturedAt: fresh, serviceRadiusKm: 20, locationSharingEnabled: true } });
        expect(location.statusCode, location.body).toBe(200);
      }

      const taskId = await createQueuedDispatchTask(app);
      const match = await app.inject({ method: "POST", url: "/api/internal/dispatch/match-once", headers: operatorHeaders, payload: { dispatchTaskId: taskId } });
      expect(match.statusCode, match.body).toBe(200);
      const startedAt = performance.now();
      const responses = await Promise.all(Array.from({ length: 40 }, (_, index) => app.inject({
        method: "POST",
        url: `/api/worker/tasks/${taskId}/accept`,
        headers: index % 2 === 0 ? workerHangzhouHeaders : workerHangzhouAltHeaders,
        payload: {},
      })));
      const durationMs = performance.now() - startedAt;
      expect(durationMs).toBeLessThan(offerBudgetMs);
      expect(responses.some(response => response.statusCode === 200)).toBe(true);
      expect(responses.every(response => response.statusCode === 200 || response.statusCode === 409), responses.map(response => `${response.statusCode}:${response.body}`).join("\n")).toBe(true);

      const [acceptances] = await pool.query<(RowDataPacket & { count: number; workers: number })[]>(
        "SELECT COUNT(*) count,COUNT(DISTINCT worker_id) workers FROM worker_task_acceptances WHERE city_code='hangzhou' AND dispatch_task_id=?",
        [taskId],
      );
      expect(acceptances[0]).toMatchObject({ count: 1, workers: 1 });
      const [acceptedOffers] = await pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM dispatch_offers WHERE city_code='hangzhou' AND dispatch_task_id=? AND status='accepted'", [taskId]);
      expect(acceptedOffers[0]?.count).toBe(1);
    } finally {
      await pool.query("UPDATE worker_online_status SET is_online=0 WHERE city_code='hangzhou' AND worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt')");
      await pool.query("DELETE FROM worker_locations WHERE city_code='hangzhou' AND worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt')");
      await pool.query("DELETE FROM worker_dispatch_preferences WHERE city_code='hangzhou' AND worker_id IN ('worker-demo-hangzhou','worker-demo-hangzhou-alt')");
      await app.close();
    }
  });

  it("deduplicates a 20-request webhook retry storm under the city run lock", async () => {
    const app = await buildApp();
    const pool = getMysqlPool();
    try {
      await pool.query("UPDATE business_webhook_subscriptions SET status='paused' WHERE status='active'");
      const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 7)}`;
      const client = await app.inject({ method: "POST", url: "/api/internal/enterprise/clients", headers: adminHeaders, payload: { clientCode: `P22P_${suffix.slice(-8).toUpperCase()}`, name: `P22 Performance ${suffix}`, billingMode: "single", contactName: "Ops", contactPhone: "13800000001" } });
      expect(client.statusCode, client.body).toBe(200);
      const clientId = client.json().client.businessClientId as string;
      const credential = await app.inject({ method: "POST", url: `/api/internal/enterprise/clients/${clientId}/credentials`, headers: adminHeaders, payload: { name: "Performance", scopes: ["enterprise:orders:read", "enterprise:orders:write", "enterprise:webhooks:read", "enterprise:webhooks:write"] } });
      const apiKey = credential.json().apiKey as string;
      expect((await app.inject({ method: "POST", url: "/openapi/v1/webhook-subscriptions", headers: keyHeaders(apiKey), payload: { callbackUrl: `mock://fail/phase22-${suffix}`, eventTypes: ["order.created"] } })).statusCode).toBe(200);
      const externalOrderId = `PERF-${suffix}`;
      const order = await app.inject({ method: "POST", url: "/openapi/v1/orders", headers: keyHeaders(apiKey), payload: { externalOrderId, idempotencyKey: `perf-${suffix}`, skuId: "sku_home_daily_2h", quantity: 1, addressProvince: "Zhejiang", addressCity: "Hangzhou", addressDistrict: "Xihu", detailAddress: "Performance Road 1", contactName: "Ops", contactPhone: "13800000001", scheduledAt: "2026-07-20T02:00:00.000Z", scheduledTimeSlot: "morning" } });
      expect(order.statusCode, order.body).toBe(200);

      const startedAt = performance.now();
      const responses = await Promise.all(Array.from({ length: 20 }, () => app.inject({ method: "POST", url: "/api/internal/enterprise/webhooks/run-once", headers: adminHeaders, payload: {} })));
      const durationMs = performance.now() - startedAt;
      expect(durationMs).toBeLessThan(webhookBudgetMs);
      expect(responses.every(response => response.statusCode === 200), responses.map(response => `${response.statusCode}:${response.body}`).join("\n")).toBe(true);

      const [deliveries] = await pool.query<(RowDataPacket & { count: number; max_attempts_seen: number; external_runs: number })[]>(
        `SELECT COUNT(*) count,MAX(attempt_count) max_attempts_seen,
                SUM(COALESCE(JSON_EXTRACT(provider_envelope_json,'$.externalProviderExecuted'),0)) external_runs
           FROM business_webhook_deliveries
          WHERE city_code='hangzhou' AND business_client_id=?`,
        [clientId],
      );
      expect(deliveries[0]).toMatchObject({ count: 1, max_attempts_seen: 1 });
      expect(Number(deliveries[0]?.external_runs)).toBe(0);
    } finally {
      await app.close();
    }
  });
});
