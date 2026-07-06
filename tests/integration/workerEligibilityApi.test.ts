import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { XLB_HEADERS } from "@xlb/types";
import { createQueuedDispatchTask } from "./helpers/acceptTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHangzhouHeaders = {
  [XLB_HEADERS.appType]: "worker",
  [XLB_HEADERS.role]: "worker",
  [XLB_HEADERS.cityCode]: "hangzhou",
  [XLB_HEADERS.userId]: "worker-demo-hangzhou",
};

describe.skipIf(!runDb)("workerEligibilityApi integration", { timeout: 20000 }, () => {
  it("returns eligible for demo worker with approved cert", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/eligibility?skuId=sku_home_daily_2h",
      headers: workerHangzhouHeaders,
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.eligibility.workerId).toBe("worker-demo-hangzhou");
    expect(body.eligibility.cityCode).toBe("hangzhou");
    expect(body.eligibility.skuId).toBe("sku_home_daily_2h");
    expect(body.eligibility.isEligible).toBe(true);
    await app.close();
  });

  it("returns 400 without cityCode", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/eligibility?skuId=sku_home_daily_2h",
      headers: {
        [XLB_HEADERS.appType]: "worker",
        [XLB_HEADERS.role]: "worker",
        [XLB_HEADERS.userId]: "worker-demo-hangzhou",
      },
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it("returns 403 for unbound city", async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: "GET",
      url: "/api/worker/eligibility?skuId=sku_home_daily_2h",
      headers: {
        ...workerHangzhouHeaders,
        [XLB_HEADERS.cityCode]: "shanghai",
      },
    });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it("does not modify dispatch_tasks status", async () => {
    const app = await buildApp();
    const pool = getMysqlPool();
    const dispatchTaskId = await createQueuedDispatchTask(app);

    await app.inject({
      method: "GET",
      url: "/api/worker/eligibility?skuId=sku_home_daily_2h",
      headers: workerHangzhouHeaders,
    });

    const [after] = await pool.query<(RowDataPacket & { status: string })[]>(
      `SELECT status FROM dispatch_tasks WHERE dispatch_task_id = ?`,
      [dispatchTaskId],
    );
    expect(after[0]?.status).toBe("queued");

    await app.close();
  });
});
