import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { createPaidOrderForDispatch, operatorHeaders } from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("dispatchRunOnce integration", { timeout: 20000 }, () => {
  it("processes pending order.created into dispatch_task", async () => {
    const app = await buildApp();
    const orderId = await createPaidOrderForDispatch(app);

    const pool = getMysqlPool();
    let task: {
      order_id: string;
      city_code: string;
      stream_name: string;
      stream_entry_id: string | null;
      status: string;
    } | undefined;

    for (let i = 0; i < 15; i++) {
      const runRes = await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/run-once",
        headers: operatorHeaders,
        payload: {},
      });
      expect(runRes.statusCode).toBe(200);

      const [tasks] = await pool.query<
        (RowDataPacket & {
          order_id: string;
          city_code: string;
          stream_name: string;
          stream_entry_id: string | null;
          status: string;
        })[]
      >(
        `SELECT order_id, city_code, stream_name, stream_entry_id, status
         FROM dispatch_tasks WHERE order_id = ?`,
        [orderId],
      );
      task = tasks[0];
      if (task?.status === "queued" && task.stream_entry_id) break;
    }

    expect(task).toBeDefined();
    expect(task!.city_code).toBe("hangzhou");
    expect(task!.stream_name).toBe("xlb:dispatch:hangzhou:orders");
    expect(task!.stream_entry_id).toBeTruthy();
    expect(task!.status).toBe("queued");

    await app.close();
  });

  it("is idempotent on second run-once for same order", async () => {
    const app = await buildApp();
    const orderId = await createPaidOrderForDispatch(app);

    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const pool = getMysqlPool();
    const [before] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM dispatch_tasks WHERE order_id = ?`,
      [orderId],
    );

    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const [after] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM dispatch_tasks WHERE order_id = ?`,
      [orderId],
    );

    expect(Number(before[0].cnt)).toBe(1);
    expect(Number(after[0].cnt)).toBe(1);

    await app.close();
  });
});
