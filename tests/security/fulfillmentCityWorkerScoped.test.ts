import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  ensureAltHangzhouWorkerBound,
  ensureHangzhouWorkerEligible,
  workerHangzhouAltHeaders,
  workerHangzhouHeaders,
  workerShanghaiHeaders,
} from "../integration/helpers/acceptTestHelper.js";
import { bearerHeaders } from "../integration/helpers/authTestHelper.js";
import { createAcceptedFulfillment } from "../integration/helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentCityWorkerScoped", { timeout: 30000 }, () => {
  beforeEach(async () => { await ensureHangzhouWorkerEligible(); await ensureAltHangzhouWorkerBound(); });

  it("rejects wrong worker, city, missing city, and non-worker role", async () => {
    const app = await buildApp();
    const { fulfillmentId } = await createAcceptedFulfillment(app);
    const url = `/api/worker/fulfillments/${fulfillmentId}/start`;
    expect((await app.inject({ method: "POST", url, headers: workerHangzhouAltHeaders, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url, headers: workerShanghaiHeaders, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url, headers: bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou" }), payload: {} })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url, headers: bearerHeaders({ appType: "customer", role: "customer", userId: "worker-demo-hangzhou", cityCode: "hangzhou" }), payload: {} })).statusCode).toBe(403);
    await app.inject({ method: "POST", url, headers: workerHangzhouHeaders, payload: {} });
    const completeUrl = `/api/worker/fulfillments/${fulfillmentId}/complete`;
    expect((await app.inject({ method: "POST", url: completeUrl, headers: workerHangzhouAltHeaders, payload: {} })).statusCode).toBe(404);
    await app.close();
  });
});
