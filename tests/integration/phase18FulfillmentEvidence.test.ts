import type { RowDataPacket } from "mysql2/promise";
import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import {
  customerHeaders,
} from "./helpers/dispatchTestHelper.js";
import {
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
} from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const png = Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,0x01]);
const otherCustomerHeaders = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-002", cityCode: "hangzhou" });
const otherWorkerHeaders = bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-other", cityCode: "hangzhou" });
const shanghaiCustomerHeaders = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-dispatch-001", cityCode: "shanghai" });
const shanghaiWorkerHeaders = bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou", cityCode: "shanghai" });
const shanghaiAdminHeaders = bearerHeaders({ appType: "admin", role: "operator", userId: "admin-operator", cityCode: "shanghai" });

async function upload(app: Awaited<ReturnType<typeof buildApp>>, fulfillmentId: string, evidenceType: string, complaintId?: string) {
  const query = new URLSearchParams({ evidenceType, note: `${evidenceType} proof` });
  if (complaintId) query.set("complaintId", complaintId);
  return app.inject({
    method: "POST",
    url: `/api/worker/fulfillments/${fulfillmentId}/evidence?${query}`,
    headers: { ...workerHangzhouHeaders, "content-type": "image/png", "x-file-name": `${evidenceType}.png` },
    payload: png,
  });
}

async function startAndComplete(app: Awaited<ReturnType<typeof buildApp>>, fulfillmentId: string) {
  expect((await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} })).statusCode).toBe(200);
  const complete = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "evidence-backed completion" } });
  expect(complete.statusCode, complete.body).toBe(200);
}

describe.skipIf(!runDb)("Phase 18 fulfillment evidence and customer confirmation", { timeout: 60000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("stores private local evidence and runs a real customer confirmation flow", async () => {
    const app = await buildApp();
    try {
      const { fulfillmentId, orderId } = await createAcceptedFulfillment(app);

      const badSignature = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=arrival`,
        headers: { ...workerHangzhouHeaders, "content-type": "image/png", "x-file-name": "spoof.png" },
        payload: Buffer.from("not an image"),
      });
      expect(badSignature.statusCode).toBe(400);

      const before = await upload(app, fulfillmentId, "before_service");
      expect(before.statusCode, before.body).toBe(200);
      expect(before.json().evidence.mediaAsset).toMatchObject({
        cityCode: "hangzhou",
        orderId,
        fulfillmentId,
        signatureValidated: true,
        securityScanStatus: "not_malware_scanned_local",
        storage: { provider: "local", providerStatus: "stored_local", externalProviderExecuted: false, publicUrl: null },
      });

      expect((await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} })).statusCode).toBe(200);
      const after = await upload(app, fulfillmentId, "after_service");
      expect(after.statusCode, after.body).toBe(200);
      const mediaAssetId = after.json().evidence.mediaAssetId as string;
      expect((await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: {} })).statusCode).toBe(200);

      const customerView = await app.inject({ method: "GET", url: `/api/customer/orders/${orderId}/fulfillment-evidence`, headers: customerHeaders });
      expect(customerView.statusCode, customerView.body).toBe(200);
      expect(customerView.json().aggregates[0]).toMatchObject({ fulfillmentId, confirmation: { status: "pending", customerId: "customer-dispatch-001" } });
      expect(customerView.json().aggregates[0].confirmation.evidenceSnapshot).toHaveLength(2);

      const privateContent = await app.inject({ method: "GET", url: `/api/media-assets/${mediaAssetId}/content`, headers: customerHeaders });
      expect(privateContent.statusCode).toBe(200);
      expect(privateContent.headers["cache-control"]).toBe("private, no-store");
      expect(privateContent.headers["x-content-type-options"]).toBe("nosniff");
      expect(privateContent.rawPayload).toEqual(png);
      expect((await app.inject({ method: "GET", url: `/api/media-assets/${mediaAssetId}/content`, headers: otherCustomerHeaders })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: `/api/media-assets/${mediaAssetId}/content`, headers: otherWorkerHeaders })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: `/api/media-assets/${mediaAssetId}/content`, headers: shanghaiCustomerHeaders })).statusCode).toBe(404);

      const crossCityEvidence = await app.inject({ method: "GET", url: `/api/internal/orders/${orderId}/fulfillment-evidence`, headers: shanghaiAdminHeaders });
      expect(crossCityEvidence.statusCode, crossCityEvidence.body).toBe(200);
      expect(crossCityEvidence.json().aggregates).toEqual([]);
      const crossCityComplaints = await app.inject({ method: "GET", url: `/api/internal/aftersale/complaints?orderId=${orderId}`, headers: shanghaiAdminHeaders });
      expect(crossCityComplaints.statusCode, crossCityComplaints.body).toBe(200);
      expect(crossCityComplaints.json().complaints).toEqual([]);
      const crossCityUpload = await app.inject({
        method: "POST",
        url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=arrival`,
        headers: { ...shanghaiWorkerHeaders, "content-type": "image/png", "x-file-name": "cross-city.png" },
        payload: png,
      });
      expect(crossCityUpload.statusCode).toBe(404);

      const confirmed = await app.inject({ method: "POST", url: `/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`, headers: customerHeaders, payload: { decision: "confirmed", note: "service accepted" } });
      expect(confirmed.statusCode, confirmed.body).toBe(200);
      expect(confirmed.json()).toMatchObject({ idempotent: false, confirmation: { status: "confirmed", complaintId: null } });
      const replay = await app.inject({ method: "POST", url: `/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`, headers: customerHeaders, payload: { decision: "confirmed" } });
      expect(replay.json().idempotent).toBe(true);
      expect((await upload(app, fulfillmentId, "completion")).statusCode).toBe(409);

      const [rows] = await getMysqlPool().query<(RowDataPacket & { external_provider_executed: number; public_url: string | null })[]>(
        "SELECT external_provider_executed, public_url FROM media_assets WHERE city_code=? AND fulfillment_id=?",
        ["hangzhou", fulfillmentId],
      );
      expect(rows).toHaveLength(2);
      expect(rows.every((row) => row.external_provider_executed === 0 && row.public_url === null)).toBe(true);
    } finally {
      await app.close();
    }
  });

  it("binds a customer dispute to a same-order Phase 17 complaint", async () => {
    const app = await buildApp();
    try {
      const { fulfillmentId, orderId } = await createAcceptedFulfillment(app);
      expect((await upload(app, fulfillmentId, "after_service")).statusCode).toBe(200);
      await startAndComplete(app, fulfillmentId);

      const complaint = await app.inject({
        method: "POST",
        url: "/api/aftersale/complaints",
        headers: customerHeaders,
        payload: { orderId, category: "service_quality", priority: "urgent", description: "completion evidence does not match the service result", idempotencyKey: `p18-dispute-${Date.now()}-${Math.random()}` },
      });
      expect(complaint.statusCode, complaint.body).toBe(200);
      const complaintId = complaint.json().complaint.complaintId as string;

      const complaintEvidence = await upload(app, fulfillmentId, "diagnosis", complaintId);
      expect(complaintEvidence.statusCode, complaintEvidence.body).toBe(200);
      expect(complaintEvidence.json().evidence).toMatchObject({ orderId, fulfillmentId, complaintId });
      expect(complaintEvidence.json().evidence.mediaAsset).toMatchObject({ orderId, fulfillmentId, complaintId });

      const disputed = await app.inject({
        method: "POST",
        url: `/api/customer/fulfillments/${fulfillmentId}/customer-confirmation`,
        headers: customerHeaders,
        payload: { decision: "disputed", complaintId, note: "uploaded result differs from the delivered service" },
      });
      expect(disputed.statusCode, disputed.body).toBe(200);
      expect(disputed.json().confirmation).toMatchObject({ status: "disputed", complaintId });

      const [timeline] = await getMysqlPool().query<(RowDataPacket & { event_type: string })[]>(
        "SELECT event_type FROM aftersale_timeline_events WHERE city_code=? AND complaint_id=? AND event_type='fulfillment.customer_disputed'",
        ["hangzhou", complaintId],
      );
      expect(timeline).toHaveLength(1);
      const [bindings] = await getMysqlPool().query<(RowDataPacket & { evidence_complaint_id: string; media_complaint_id: string })[]>(
        `SELECT fe.complaint_id AS evidence_complaint_id, ma.complaint_id AS media_complaint_id
         FROM fulfillment_evidence fe INNER JOIN media_assets ma ON ma.media_asset_id=fe.media_asset_id
         WHERE fe.city_code=? AND fe.fulfillment_id=? AND fe.complaint_id=?`,
        ["hangzhou", fulfillmentId, complaintId],
      );
      expect(bindings).toEqual([expect.objectContaining({ evidence_complaint_id: complaintId, media_complaint_id: complaintId })]);
    } finally {
      await app.close();
    }
  });

  it("rejects a direct cross-city media reference at the database boundary", async () => {
    const app = await buildApp();
    try {
      const { fulfillmentId, orderId } = await createAcceptedFulfillment(app);
      const mediaAssetId = `med_cross_city_${Date.now()}`;
      await expect(getMysqlPool().query(
        `INSERT INTO media_assets (
           media_asset_id,city_code,order_id,fulfillment_id,complaint_id,uploaded_by_type,uploaded_by_id,
           original_file_name,content_type,size_bytes,checksum_sha256,signature_validated,security_scan_status,
           storage_provider,storage_provider_name,storage_provider_status,external_provider_executed,
           object_key,storage_uri,public_url,stored_at
         ) VALUES (?, 'shanghai', ?, ?, NULL, 'worker', 'worker-demo-hangzhou', 'cross-city.png',
           'image/png', 9, ?, 1, 'not_malware_scanned_local', 'mock', 'xlb-memory-mock', 'stored_mock',
           0, ?, ?, NULL, CURRENT_TIMESTAMP)`,
        [mediaAssetId, orderId, fulfillmentId, "a".repeat(64), `shanghai/cross-city/${mediaAssetId}.png`, `xlb-mock://shanghai/cross-city/${mediaAssetId}.png`],
      )).rejects.toThrow(/foreign key constraint fails/i);
    } finally {
      await app.close();
    }
  });
});
