import { beforeEach, describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
} from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentCompleteApi", { timeout: 30000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("rejects direct complete, then completes in_progress idempotently", async () => {
    const app = await buildApp();
    const { fulfillmentId } = await createAcceptedFulfillment(app);

    const acceptedDetail = await app.inject({
      method: "GET",
      url: `/api/worker/fulfillments/${fulfillmentId}`,
      headers: workerHangzhouHeaders,
    });
    expect(acceptedDetail.statusCode).toBe(200);
    expect(acceptedDetail.json()).toMatchObject({
      ok: true,
      fulfillment: { fulfillmentId, status: "accepted" },
    });

    const direct = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(direct.statusCode).toBe(409);

    const start = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/start`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(start.statusCode).toBe(200);
    expect(start.json()).toMatchObject({
      ok: true,
      idempotent: false,
      fulfillment: { fulfillmentId, status: "in_progress" },
    });

    const inProgressDetail = await app.inject({
      method: "GET",
      url: `/api/worker/fulfillments/${fulfillmentId}`,
      headers: workerHangzhouHeaders,
    });
    expect(inProgressDetail.statusCode).toBe(200);
    expect(inProgressDetail.json()).toMatchObject({
      ok: true,
      fulfillment: { fulfillmentId, status: "in_progress" },
    });

    const complete = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHangzhouHeaders,
      payload: { completionNote: "service complete" },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json()).toMatchObject({
      ok: true,
      idempotent: false,
      fulfillment: {
        fulfillmentId,
        status: "completed",
        completionNote: "service complete",
      },
    });
    expect(complete.json().fulfillment.completedAt).toBeTruthy();

    const completedList = await app.inject({
      method: "GET",
      url: "/api/worker/fulfillments",
      headers: workerHangzhouHeaders,
    });
    expect(completedList.statusCode).toBe(200);
    expect(completedList.json().fulfillments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fulfillmentId, status: "completed" }),
      ]),
    );

    const repeat = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHangzhouHeaders,
      payload: { completionNote: "ignored retry" },
    });
    expect(repeat.statusCode).toBe(200);
    expect(repeat.json().idempotent).toBe(true);

    const restart = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/start`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(restart.statusCode).toBe(409);
    await app.close();
  });
});
