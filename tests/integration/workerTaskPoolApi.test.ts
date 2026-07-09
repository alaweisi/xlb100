import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { bearerHeaders, workerAuthHeaders } from "./helpers/authTestHelper.js";
import {
  createPaidOrderForDispatch,
  operatorHeaders,
} from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = workerAuthHeaders("worker-demo-hangzhou", "hangzhou");
const workerShanghaiHeaders = workerAuthHeaders("worker-demo-hangzhou", "shanghai");

describe.skipIf(!runDb)("workerTaskPoolApi integration", { timeout: 20000 }, () => {
  it("returns hangzhou queued tasks for bound worker", async () => {
    const app = await buildApp();
    await createPaidOrderForDispatch(app);
    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerHangzhouHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.cityCode).toBe("hangzhou");
    expect(body.tasks.length).toBeGreaterThan(0);
    expect(body.tasks.every((t: { cityCode: string }) => t.cityCode === "hangzhou")).toBe(
      true,
    );
    expect(body.tasks.every((t: { status: string }) => t.status === "queued")).toBe(true);

    await app.close();
  });

  it("returns 403 for unbound city", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerShanghaiHeaders,
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: bearerHeaders({ appType: "worker", role: "worker", userId: "worker-demo-hangzhou" }),
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 403 for non-worker appType", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: bearerHeaders({ appType: "customer", role: "customer", userId: "worker-demo-hangzhou", cityCode: "hangzhou" }),
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("does not modify dispatch_tasks status", async () => {
    const app = await buildApp();
    const orderId = await createPaidOrderForDispatch(app);
    const pool = getMysqlPool();

    for (let i = 0; i < 15; i++) {
      await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/run-once",
        headers: operatorHeaders,
        payload: {},
      });

      const [tasks] = await pool.query<(RowDataPacket & { status: string })[]>(
        `SELECT status FROM dispatch_tasks WHERE order_id = ?`,
        [orderId],
      );
      if (tasks[0]?.status === "queued") break;
    }

    await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerHangzhouHeaders,
    });

    const [rows] = await pool.query<(RowDataPacket & { status: string })[]>(
      `SELECT status FROM dispatch_tasks WHERE order_id = ?`,
      [orderId],
    );
    expect(rows[0]?.status).toBe("queued");

    await app.close();
  });

  it("returns newest queued task first", async () => {
    const app = await buildApp();
    const olderOrderId = await createPaidOrderForDispatch(app);
    const newerOrderId = await createPaidOrderForDispatch(app);
    const pool = getMysqlPool();

    for (let i = 0; i < 15; i++) {
      await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/run-once",
        headers: operatorHeaders,
        payload: {},
      });

      const [tasks] = await pool.query<
        (RowDataPacket & { order_id: string; dispatch_task_id: string })[]
      >(
        `SELECT order_id, dispatch_task_id
         FROM dispatch_tasks
         WHERE order_id IN (?, ?) AND status = 'queued'`,
        [olderOrderId, newerOrderId],
      );

      if (tasks.length === 2) break;
    }

    const [rows] = await pool.query<
      (RowDataPacket & { order_id: string; dispatch_task_id: string })[]
    >(
      `SELECT order_id, dispatch_task_id
       FROM dispatch_tasks
       WHERE order_id IN (?, ?) AND status = 'queued'`,
      [olderOrderId, newerOrderId],
    );

    const olderTask = rows.find((row) => row.order_id === olderOrderId);
    const newerTask = rows.find((row) => row.order_id === newerOrderId);
    expect(olderTask?.dispatch_task_id).toBeTruthy();
    expect(newerTask?.dispatch_task_id).toBeTruthy();

    await pool.query(
      `UPDATE dispatch_tasks
       SET created_at = CASE
         WHEN dispatch_task_id = ? THEN '2030-01-01 00:00:00'
         WHEN dispatch_task_id = ? THEN '2030-01-01 00:00:01'
         ELSE created_at
       END
       WHERE dispatch_task_id IN (?, ?)`,
      [
        olderTask?.dispatch_task_id,
        newerTask?.dispatch_task_id,
        olderTask?.dispatch_task_id,
        newerTask?.dispatch_task_id,
      ],
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerHangzhouHeaders,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.tasks[0]?.dispatchTaskId).toBe(newerTask?.dispatch_task_id);
    expect(body.tasks[0]?.orderId).toBe(newerOrderId);

    await app.close();
  });
});
