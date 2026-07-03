import { beforeEach, describe, expect, it } from "vitest";
import type { RowDataPacket } from "mysql2/promise";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible, workerHangzhouHeaders } from "./helpers/acceptTestHelper.js";
import { createAcceptedFulfillment } from "./helpers/fulfillmentTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

describe.skipIf(!runDb)("fulfillmentLifecycleEvents", { timeout: 30000 }, () => {
  beforeEach(ensureHangzhouWorkerEligible);

  it("writes exactly one started and completed event", async () => {
    const app = await buildApp();
    const { fulfillmentId } = await createAcceptedFulfillment(app);
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "done" } });
    await app.inject({ method: "POST", url: `/api/worker/fulfillments/${fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "done" } });

    const [rows] = await getMysqlPool().query<
      (RowDataPacket & {
        event_type: string;
        payload_json: string | Record<string, unknown>;
      })[]
    >(
      `SELECT event_type, payload_json FROM event_outbox
       WHERE aggregate_id = ? AND event_type IN ('fulfillment.started', 'fulfillment.completed')
       ORDER BY created_at`,
      [fulfillmentId],
    );
    expect(rows.map((row) => row.event_type)).toEqual(["fulfillment.started", "fulfillment.completed"]);
    const completed = rows.find((row) => row.event_type === "fulfillment.completed");
    const payload =
      typeof completed!.payload_json === "string"
        ? JSON.parse(completed!.payload_json)
        : completed!.payload_json;
    expect(payload).toMatchObject({ fulfillmentId, completionNote: "done" });
    await app.close();
  });
});
