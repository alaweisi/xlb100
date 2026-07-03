import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createQueuedDispatchTask,
  ensureAltHangzhouWorkerBound,
  workerHangzhouAltHeaders,
} from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("workerAcceptEligibility integration", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await ensureAltHangzhouWorkerBound();
  });

  it("returns 403 when worker is not eligible for task sku", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouAltHeaders,
      payload: {},
    });

    expect(res.statusCode).toBe(403);
    const pool = getMysqlPool();
    const [rows] = await pool.query<{ cnt: number }[]>(
      `SELECT COUNT(*) AS cnt FROM worker_task_acceptances WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    expect(Number(rows[0]?.cnt)).toBe(0);

    await app.close();
  });
});
