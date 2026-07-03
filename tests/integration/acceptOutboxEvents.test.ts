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

describe.skipIf(!runDb)("acceptOutboxEvents integration", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await ensureHangzhouWorkerEligible();
  });

  it("writes dispatch.accepted and fulfillment.created events", async () => {    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const fulfillmentId = res.json().fulfillment.fulfillmentId as string;

    const pool = getMysqlPool();
    const [events] = await pool.query<
      (RowDataPacket & { event_type: string; aggregate_id: string })[]
    >(
      `SELECT event_type, aggregate_id FROM event_outbox
       WHERE aggregate_id IN (?, ?) ORDER BY created_at ASC`,
      [dispatchTaskId, fulfillmentId],
    );

    const types = events.map((e) => e.event_type);
    expect(types).toContain("dispatch.accepted");
    expect(types).toContain("fulfillment.created");

    await app.close();
  });
});
