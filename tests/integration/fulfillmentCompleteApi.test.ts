import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentCompleteApi", { timeout: 30000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("rejects direct complete, then completes in_progress idempotently", async () => {
    const app = await buildApp();
    const { fulfillmentId } = await createAcceptedFulfillment(app);
    const direct = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: {} });
    expect(direct.statusCode).toBe(409);

    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    const complete = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "服务已完成" } });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({ ok: true, idempotent: false, fulfillment: { status: "completed", completionNote: "服务已完成" } });
    expect(complete.json().fulfillment.completedAt).toBeTruthy();

    const repeat = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "ignored retry" } });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().idempotent).toBe(true);

    const restart = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    expect(restart.statusCode).toBe(409);
    await app.close();
  });
});
