import { describe, it, expect, beforeEach } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { bearerHeaders } from "./helpers/authTestHelper.js";
import {
  createQueuedDispatchTask,
  ensureAltHangzhouWorkerBound,
  ensureHangzhouWorkerEligible,
  workerHangzhouHeaders,
  workerHangzhouAltHeaders,
} from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("workerAcceptApi integration", { timeout: 30000 }, () => {
  beforeEach(async () => {
    await ensureHangzhouWorkerEligible();
    await ensureAltHangzhouWorkerBound();
  });

  it("eligible worker accepts queued dispatch task", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.acceptance.status).toBe("accepted");
    expect(body.fulfillment.status).toBe("accepted");
    expect(body.idempotent).toBe(false);

    const pool = getMysqlPool();
    const [task] = await pool.query<(RowDataPacket & { status: string })[]>(
      `SELECT status FROM dispatch_tasks WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    expect(task[0]?.status).toBe("accepted");

    await app.close();
  });

  it("returns idempotent on repeat accept by same worker", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const first = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().idempotent).toBe(true);

    const pool = getMysqlPool();
    const [count] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM worker_task_acceptances WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    expect(Number(count[0]?.cnt)).toBe(1);

    await app.close();
  });

  it("returns 409 when another worker tries to accept", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouHeaders,
      payload: {},
    });

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: workerHangzhouAltHeaders,
      payload: {},
    });
    expect(res.statusCode).toBe(409);

    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou" }),
      payload: {},
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 403 for customer role", async () => {
    const app = await buildApp();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    const res = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${dispatchTaskId}/accept`,
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "worker-demo-hangzhou", cityCode: "hangzhou" }),
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
