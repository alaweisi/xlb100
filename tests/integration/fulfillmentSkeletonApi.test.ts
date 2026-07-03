import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  createQueuedDispatchTask,
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
} from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentSkeletonApi integration", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await ensureHangzhouWorkerEligible();
  });

  it("lists and gets worker fulfillment skeleton", async () => {    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const accept = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    const fulfillmentId = accept.json().fulfillment.fulfillmentId as string;

    const list = await app.inject({
      method: "GET",
      url: "/api/worker/fulfillments",
      headers: workerHangzhouHeaders,
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().fulfillments.some(
      (f: { fulfillmentId: string }) => f.fulfillmentId === fulfillmentId,
    )).toBe(true);

    const detail = await app.inject({
      method: "GET",
      url: `/api/worker/fulfillments/${fulfillmentId}`,
      headers: workerHangzhouHeaders,
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().fulfillment.status).toBe("accepted");
    expect(detail.json().fulfillment.startedAt).toBeNull();
    expect(detail.json().fulfillment.completedAt).toBeNull();

    const complete = await app.inject({
      method: "POST",
      url: `/api/worker/fulfillments/${fulfillmentId}/complete`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect([404, 405]).toContain(complete.statusCode);

    await app.close();
  });
});
