import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
} from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentStartApi", { timeout: 30000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("starts accepted fulfillment and retries idempotently", async () => {
    const app = await buildApp();
    const { fulfillmentId } = await createAcceptedFulfillment(app);

    const first = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ ok: true, idempotent: false, fulfillment: { status: "in_progress" } });
    expect(first.json().fulfillment.startedAt).toBeTruthy();

    const repeat = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().idempotent).toBe(true);
    await app.close();
  });
});
