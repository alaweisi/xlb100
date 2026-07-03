import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import {
  createQueuedDispatchTask,
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
} from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("workerAcceptIdempotency integration", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await ensureHangzhouWorkerEligible();
  });

  it("repeat accept returns same acceptance and fulfillment ids", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const first = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(first.statusCode).toBe(200);
    const firstBody = first.json();

    const second = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    const secondBody = second.json();

    expect(secondBody.idempotent).toBe(true);
    expect(secondBody.acceptance.acceptanceId).toBe(firstBody.acceptance.acceptanceId);
    expect(secondBody.fulfillment.fulfillmentId).toBe(firstBody.fulfillment.fulfillmentId);

    const pool = getMysqlPool();
    const [acceptanceCount] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM worker_task_acceptances WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    const [fulfillmentCount] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM fulfillments WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    expect(Number(acceptanceCount[0]?.cnt)).toBe(1);
    expect(Number(fulfillmentCount[0]?.cnt)).toBe(1);

    await app.close();
  });
});
