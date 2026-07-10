import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders, workerShanghaiHeaders } from "../integration/helpers/acceptTestHelper.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";
import { customerHeaders } from "../integration/helpers/dispatchTestHelper.js";
import { createAcceptedFulfillment } from "../integration/helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const customerB = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-demo-002", cityCode: "hangzhou" });
const shanghaiCustomer = bearerHeaders({ appType: "customer", role: "customer", userId: "customer-dispatch-001", cityCode: "shanghai" });
const adminHangzhou = bearerHeaders({ appType: "admin", role: "operator", userId: "phase22-admin", cityCode: "hangzhou" });
const adminShanghai = bearerHeaders({ appType: "admin", role: "operator", userId: "phase22-admin", cityCode: "shanghai" });
const keyHeaders = (key: string) => ({ "x-xlb-api-key": key });

describe.skipIf(!runDb)("Phase 22 systematic authorization attack matrix", { timeout: 90_000 }, () => {
  it("rejects cross-customer, cross-role, cross-city, and cross-enterprise probes", async () => {
    await ensureHangzhouWorkerEligible();
    const app = await buildApp();
    try {
      const { orderId, fulfillmentId } = await createAcceptedFulfillment(app);
      const evidence = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=arrival`, headers: { ...workerHangzhouHeaders, "content-type": "image/png", "x-file-name": "phase22-auth.png" }, payload: png });
      expect(evidence.statusCode, evidence.body).toBe(200);
      const mediaAssetId = evidence.json().evidence.mediaAssetId as string;
      const complaint = await app.inject({ method: "POST", url: "/api/aftersale/complaints", headers: customerHeaders, payload: { orderId, category: "service_quality", priority: "normal", description: "Phase 22 authorization matrix complaint", idempotencyKey: `phase22-auth-${orderId}` } });
      expect(complaint.statusCode, complaint.body).toBe(200);
      const complaintId = complaint.json().complaint.complaintId as string;

      const probes = [
        { name: "customer B reads customer A order", expected: 403, response: () => app.inject({ method: "GET", url: `/api/orders/${orderId}`, headers: customerB }) },
        { name: "customer B reads private evidence bytes", expected: 403, response: () => app.inject({ method: "GET", url: `/api/media-assets/${mediaAssetId}/content`, headers: customerB }) },
        { name: "customer B reads customer A complaint", expected: 403, response: () => app.inject({ method: "GET", url: `/api/aftersale/complaints/${complaintId}`, headers: customerB }) },
        { name: "same customer crosses city for order", expected: 404, response: () => app.inject({ method: "GET", url: `/api/orders/${orderId}`, headers: shanghaiCustomer }) },
        { name: "worker crosses city to upload evidence", expected: 404, response: () => app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/evidence?evidenceType=arrival`, headers: { ...workerShanghaiHeaders, "content-type": "image/png", "x-file-name": "cross-city.png" }, payload: png }) },
        { name: "worker calls admin SKU mutation", expected: 403, response: () => app.inject({ method: "POST", url: "/api/internal/operations/skus/sku_home_daily_2h/status", headers: workerHangzhouHeaders, payload: { enabled: false } }) },
        { name: "customer calls worker location API", expected: 403, response: () => app.inject({ method: "GET", url: "/api/worker/location", headers: customerHeaders }) },
        { name: "admin calls customer profile API", expected: 403, response: () => app.inject({ method: "GET", url: "/api/customer/profile", headers: adminHangzhou }) },
      ] as const;
      for (const probe of probes) {
        const response = await probe.response();
        expect(response.statusCode, `${probe.name}: ${response.body}`).toBe(probe.expected);
      }

      const shanghaiEvidence = await app.inject({ method: "GET", url: `/api/internal/orders/${orderId}/fulfillment-evidence`, headers: adminShanghai });
      expect(shanghaiEvidence.statusCode).toBe(200);
      expect(shanghaiEvidence.json().aggregates).toEqual([]);
      const shanghaiComplaints = await app.inject({ method: "GET", url: `/api/internal/aftersale/complaints?orderId=${orderId}`, headers: adminShanghai });
      expect(shanghaiComplaints.statusCode).toBe(200);
      expect(shanghaiComplaints.json().complaints).toEqual([]);

      const suffix = `${Date.now()}${Math.random().toString(16).slice(2, 7)}`;
      const createClient = async (code: string) => {
        const response = await app.inject({ method: "POST", url: "/api/internal/enterprise/clients", headers: adminHangzhou, payload: { clientCode: code, name: code, billingMode: "single", contactName: "Ops", contactPhone: "13800000001" } });
        expect(response.statusCode, response.body).toBe(200);
        return response.json().client.businessClientId as string;
      };
      const clientA = await createClient(`P22A_${suffix.slice(-8).toUpperCase()}`);
      const clientB = await createClient(`P22B_${suffix.slice(-8).toUpperCase()}`);
      const createKey = async (clientId: string, scopes: string[]) => {
        const response = await app.inject({ method: "POST", url: `/api/internal/enterprise/clients/${clientId}/credentials`, headers: adminHangzhou, payload: { name: "Phase22 matrix", scopes } });
        expect(response.statusCode, response.body).toBe(200);
        return response.json().apiKey as string;
      };
      const keyA = await createKey(clientA, ["enterprise:orders:read", "enterprise:orders:write"]);
      const keyB = await createKey(clientB, ["enterprise:orders:read"]);
      const externalOrderId = `AUTH-${suffix}`;
      const body = { externalOrderId, idempotencyKey: `auth-${suffix}`, skuId: "sku_home_daily_2h", quantity: 1, addressProvince: "Zhejiang", addressCity: "Hangzhou", addressDistrict: "Xihu", detailAddress: "Phase 22 Road 1", contactName: "Ops", contactPhone: "13800000001", scheduledAt: "2026-07-20T02:00:00.000Z", scheduledTimeSlot: "morning" };
      expect((await app.inject({ method: "POST", url: "/openapi/v1/orders", headers: keyHeaders(keyA), payload: body })).statusCode).toBe(200);
      expect((await app.inject({ method: "GET", url: `/openapi/v1/orders/${externalOrderId}`, headers: keyHeaders(keyB) })).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url: "/openapi/v1/orders", headers: keyHeaders(keyB), payload: { ...body, externalOrderId: `${externalOrderId}-B`, idempotencyKey: `${body.idempotencyKey}-B` } })).statusCode).toBe(403);
      expect((await app.inject({ method: "GET", url: `/api/internal/enterprise/clients/${clientA}/bills`, headers: keyHeaders(keyB) })).statusCode).toBe(401);

      await expect(getMysqlPool().query(
        "UPDATE business_orders SET business_client_id=? WHERE city_code='hangzhou' AND external_order_id=?",
        [clientB, externalOrderId],
      )).rejects.toThrow();
    } finally {
      await app.close();
    }
  });
});
