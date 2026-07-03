import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import {
  createPaidOrderForDispatch,
  operatorHeaders,
} from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = {
  [XLB_HEADERS.appType]: "worker",
  [XLB_HEADERS.role]: "worker",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "worker-demo-hangzhou",
};

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
      headers: {
        ...workerHangzhouHeaders,
        [XLB_HEADERS.cityCode]: "shanghai",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: {
        [XLB_HEADERS.appType]: "worker",
        [XLB_HEADERS.role]: "worker",
        [XLB_HEADERS.userId]: "worker-demo-hangzhou",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 403 for non-worker appType", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: {
        [XLB_HEADERS.appType]: "customer",
        [XLB_HEADERS.role]: "customer",
        [XLB_HEADERS.cityCode]: "hangzhou",
        [XLB_HEADERS.userId]: "worker-demo-hangzhou",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("does not modify dispatch_tasks status", async () => {
    const app = await buildApp();
    const orderId = await createPaidOrderForDispatch(app);
    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerHangzhouHeaders,
    });

    const pool = getMysqlPool();
    const [rows] = await pool.query<(RowDataPacket & { status: string })[]>(
      `SELECT status FROM dispatch_tasks WHERE order_id = ?`,
      [orderId],
    );
    expect(rows[0]?.status).toBe("queued");

    await app.close();
  });
});
