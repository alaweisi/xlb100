import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import { customerHeaders } from "./helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const adminHeaders = bearerHeaders({ appType: "admin", role: "operator", userId: "phase22-admin", cityCode: "hangzhou" });
const keyHeaders = (apiKey: string) => ({ "x-xlb-api-key": apiKey });
const asJson = <T>(value: string | T): T => typeof value === "string" ? JSON.parse(value) as T : value;

async function snapshot(orderId: string): Promise<unknown> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { quote_snapshot: string | object })[]>(
    "SELECT quote_snapshot FROM order_price_snapshots WHERE city_code='hangzhou' AND order_id=?",
    [orderId],
  );
  expect(rows).toHaveLength(1);
  return asJson(rows[0]!.quote_snapshot);
}

describe.skipIf(!runDb)("Phase 22 cross-phase end-to-end data flow", { timeout: 90_000 }, () => {
  it("preserves quote and evidence snapshots across dispatch, fulfillment, complaint, and applicable enterprise webhook delivery", async () => {
    throw new Error("intentional hosted red-light proof: Phase 22 E2E must block CI");
    await ensureHangzhouWorkerEligible();
    const app = await buildApp();
    const pool = getMysqlPool();
    try {
      const { orderId, dispatchTaskId, fulfillmentId } = await createAcceptedFulfillment(app);
      const originalQuote = await snapshot(orderId);
      expect(originalQuote).toMatchObject({ skuId: "sku_home_daily_2h", breakdown: { totalAmount: 89 } });

      expect((await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} })).statusCode).toBe(200);
      const evidence = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=after_service&note=phase22-chain`,
        headers: { ...workerHangzhouHeaders, "content-type": "image/png", "x-file-name": "phase22-chain.png" },
        payload: png,
      });
      expect(evidence.statusCode, evidence.body).toBe(200);
      const mediaAssetId = evidence.json().evidence.mediaAssetId as string;
      const checksum = evidence.json().evidence.mediaAsset.checksumSha256 as string;
      expect(evidence.json().evidence.mediaAsset.storage.externalProviderExecuted).toBe(false);

      expect((await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "phase22 complete" } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: `/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`, headers: customerHeaders, payload: { decision: "confirmed", note: "phase22 accepted" } })).statusCode).toBe(200);
      const complaint = await app.inject({
        method: "POST",
        url: "/api/aftersale/complaints",
        headers: customerHeaders,
        payload: { orderId, category: "service_quality", priority: "normal", description: "Phase 22 post-service complaint preserves immutable evidence", idempotencyKey: `phase22-chain-${orderId}` },
      });
      expect(complaint.statusCode, complaint.body).toBe(200);
      const complaintId = complaint.json().complaint.complaintId as string;
      expect((await app.inject({ method: "POST", url: `/api/internal/aftersale/complaints/${complaintId}/triage`, headers: adminHeaders, payload: { status: "in_progress", priority: "normal", note: "phase22 triage" } })).statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: `/api/internal/aftersale/complaints/${complaintId}/resolve`, headers: adminHeaders, payload: { resolutionType: "explanation", resolutionNote: "phase22 resolved without snapshot mutation" } })).statusCode).toBe(200);

      expect(await snapshot(orderId)).toEqual(originalQuote);
      const [invariants] = await pool.query<(RowDataPacket & {
        checksum_sha256: string;
        external_provider_executed: number;
        evidence_order_id: string;
        complaint_order_id: string;
        task_status: string;
      })[]>(
        `SELECT m.checksum_sha256,m.external_provider_executed,m.order_id evidence_order_id,
                c.order_id complaint_order_id,d.status task_status
           FROM media_assets m
           JOIN aftersale_complaints c ON c.city_code=m.city_code AND c.complaint_id=?
           JOIN dispatch_tasks d ON d.city_code=m.city_code AND d.dispatch_task_id=?
          WHERE m.city_code='hangzhou' AND m.media_asset_id=?`,
        [complaintId, dispatchTaskId, mediaAssetId],
      );
      expect(invariants[0]).toMatchObject({ checksum_sha256: checksum, external_provider_executed: 0, evidence_order_id: orderId, complaint_order_id: orderId, task_status: "completed" });
      const [customerWebhookMappings] = await pool.query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) count FROM business_orders WHERE city_code='hangzhou' AND order_id=?", [orderId]);
      expect(customerWebhookMappings[0]?.count).toBe(0);

      await pool.query("UPDATE business_webhook_subscriptions SET status='paused' WHERE status='active'");
      const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 7)}`;
      const clientResponse = await app.inject({ method: "POST", url: "/api/internal/enterprise/clients", headers: adminHeaders, payload: { clientCode: `P22_${suffix.slice(-10).toUpperCase()}`, name: `Phase22 ${suffix}`, billingMode: "single", contactName: "Ops", contactPhone: "13800000001" } });
      expect(clientResponse.statusCode, clientResponse.body).toBe(200);
      const clientId = clientResponse.json().client.businessClientId as string;
      const credentialResponse = await app.inject({ method: "POST", url: `/api/internal/enterprise/clients/${clientId}/credentials`, headers: adminHeaders, payload: { name: "Phase22 chain", scopes: ["enterprise:orders:read", "enterprise:orders:write", "enterprise:webhooks:read", "enterprise:webhooks:write"] } });
      const apiKey = credentialResponse.json().apiKey as string;
      expect((await app.inject({ method: "POST", url: "/openapi/v1/webhook-subscriptions", headers: keyHeaders(apiKey), payload: { callbackUrl: `mock://success/phase22-${suffix}`, eventTypes: ["order.created"] } })).statusCode).toBe(200);
      const externalOrderId = `P22-${suffix}`;
      const enterpriseOrder = await app.inject({ method: "POST", url: "/openapi/v1/orders", headers: keyHeaders(apiKey), payload: { externalOrderId, idempotencyKey: `idem-${suffix}`, skuId: "sku_home_daily_2h", quantity: 1, addressProvince: "Zhejiang", addressCity: "Hangzhou", addressDistrict: "Xihu", detailAddress: "No. 1 Phase Road", contactName: "Enterprise Contact", contactPhone: "13800000001", scheduledAt: "2026-07-20T02:00:00.000Z", scheduledTimeSlot: "morning" } });
      expect(enterpriseOrder.statusCode, enterpriseOrder.body).toBe(200);
      const enterpriseOrderId = enterpriseOrder.json().businessOrder.orderId as string;
      const enterpriseQuote = await snapshot(enterpriseOrderId);
      const webhookRun = await app.inject({ method: "POST", url: "/api/internal/enterprise/webhooks/run-once", headers: adminHeaders, payload: {} });
      expect(webhookRun.statusCode, webhookRun.body).toBe(200);
      const deliveries = (await app.inject({ method: "GET", url: `/api/internal/enterprise/clients/${clientId}/webhook-deliveries`, headers: adminHeaders })).json().deliveries as Array<{ status: string; payload: { data: { orderId: string } }; providerEnvelope: { externalProviderExecuted: boolean } }>;
      expect(deliveries).toEqual(expect.arrayContaining([expect.objectContaining({ status: "delivered", payload: expect.objectContaining({ data: expect.objectContaining({ orderId: enterpriseOrderId }) }), providerEnvelope: expect.objectContaining({ externalProviderExecuted: false }) })]));
      expect(await snapshot(enterpriseOrderId)).toEqual(enterpriseQuote);
    } finally {
      await app.close();
    }
  });
});
