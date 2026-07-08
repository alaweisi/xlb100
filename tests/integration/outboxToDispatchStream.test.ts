import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { XLB_HEADERS } from "@xlb/types";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { getRedisClient } from "../../backend/src/dal/redisClient.js";
import type { RowDataPacket } from "mysql2/promise";
import { createPaidOrderForDispatch, operatorHeaders } from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("outboxToDispatchStream integration", { timeout: 20000 }, () => {
  it("marks order.created as published and writes Redis stream", async () => {
    const app = await buildApp();
    const orderId = await createPaidOrderForDispatch(app);

    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });

    const pool = getMysqlPool();
    let status = "pending";
    for (let i = 0; i < 10; i++) {
      const [events] = await pool.query<
        (RowDataPacket & { status: string })[]
      >(
        `SELECT status FROM event_outbox WHERE event_type = 'order.created' AND aggregate_id = ?`,
        [orderId],
      );
      status = events[0]?.status ?? "pending";
      if (status === "published") break;
      await app.inject({
        method: "POST",
        url: "/api/internal/dispatch/run-once",
        headers: operatorHeaders,
        payload: {},
      });
    }
    expect(status).toBe("published");

    const redis = getRedisClient();
    if (redis.status === "wait") await redis.connect();
    const entries = await redis.xrange("xlb:dispatch:hangzhou:orders", "-", "+");
    const flat = entries.flat().join(",");
    expect(flat).toContain(orderId);

    await app.close();
  });
});
