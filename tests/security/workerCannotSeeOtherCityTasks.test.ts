import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { workerAuthHeaders } from "../integration/helpers/authTestHelper.js";
import {
  createPaidOrderForDispatch,
  operatorHeaders,
} from "../integration/helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("workerCannotSeeOtherCityTasks", { timeout: 20000 }, () => {
  it("shanghai worker does not see hangzhou-only queued count mismatch", async () => {
    const app = await buildApp();
    await createPaidOrderForDispatch(app);
    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const hangzhouRes = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerAuthHeaders("worker-demo-hangzhou", "hangzhou"),
    });

    const shanghaiRes = await app.inject({
      method: "GET",
      url: "/api/worker/task-pool",
      headers: workerAuthHeaders("worker-demo-shanghai", "shanghai"),
    });

    expect(hangzhouRes.statusCode).toBe(200);
    expect(shanghaiRes.statusCode).toBe(200);

    const hangzhouTasks = hangzhouRes.json().tasks as { cityCode: string }[];
    const shanghaiTasks = shanghaiRes.json().tasks as { cityCode: string }[];

    expect(hangzhouTasks.every((t) => t.cityCode === "hangzhou")).toBe(true);
    expect(shanghaiTasks.every((t) => t.cityCode === "shanghai")).toBe(true);

    const pool = getMysqlPool();
    const [hzCount] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM dispatch_tasks WHERE city_code = 'hangzhou' AND status = 'queued'`,
    );
    const [shCount] = await pool.query<(RowDataPacket & { cnt: number })[]>(
      `SELECT COUNT(*) AS cnt FROM dispatch_tasks WHERE city_code = 'shanghai' AND status = 'queued'`,
    );

    if (Number(hzCount[0].cnt) > 0 && Number(shCount[0].cnt) === 0) {
      expect(hangzhouTasks.length).toBeGreaterThan(0);
      expect(shanghaiTasks.length).toBe(0);
    }

    await app.close();
  });
});
