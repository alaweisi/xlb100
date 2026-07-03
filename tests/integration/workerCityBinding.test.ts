import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("workerCityBinding integration", () => {
  it("demo worker has hangzhou binding in seed", async () => {
    const pool = getMysqlPool();
    const [rows] = await pool.query<
      (RowDataPacket & { worker_id: string; city_code: string; is_enabled: number })[]
    >(
      `SELECT worker_id, city_code, is_enabled FROM worker_city_bindings
       WHERE worker_id = 'worker-demo-hangzhou' AND city_code = 'hangzhou'`,
    );
    expect(rows.length).toBe(1);
    expect(rows[0].is_enabled).toBe(1);
  });

  it("hangzhou worker cannot access shanghai task pool", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: {
        [XLB_HEADERS.appType]: "worker",
        [XLB_HEADERS.role]: "worker",
        [XLB_HEADERS.cityCode]: "shanghai",
        [XLB_HEADERS.userId]: "worker-demo-hangzhou",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});
