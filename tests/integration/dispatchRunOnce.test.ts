import { describe, it, expect } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import type { RowDataPacket } from "mysql2/promise";
import { createOrderForDispatch, createPaidOrderForDispatch, operatorHeaders } from "./helpers/dispatchTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";

const workerHeaders = (workerId: string, cityCode = "hangzhou") => ({
  "x-xlb-app-type": "worker",
  "x-xlb-role": "worker",
  "x-xlb-city-code": cityCode,
  "x-xlb-user-id": workerId,
});

function workerId(tag: string): string {
  return `worker-sim-${tag}-${Date.now().toString(36)}`;
}

async function clearSkuEligibility(skuId: string, cityCode = "hangzhou"): Promise<void> {
  await getMysqlPool().query(
    `UPDATE worker_qualifications
     SET is_eligible = 0
     WHERE city_code = ? AND sku_id = ?`,
    [cityCode, skuId],
  );
}

async function ensureCandidateWorker(input: {
  workerId: string;
  cityCode?: string;
  skuId: string;
  distanceKm: number;
  online?: boolean;
  dispatchStatus?: string;
  certified?: boolean;
}): Promise<void> {
  const cityCode = input.cityCode ?? "hangzhou";
  await getMysqlPool().query(
    `INSERT INTO worker_profiles
      (worker_id, display_name, phone_masked, status, dispatch_status, is_certified, distance_km)
     VALUES (?, ?, '138****1000', 'active', ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       status = VALUES(status),
       dispatch_status = VALUES(dispatch_status),
       is_certified = VALUES(is_certified),
       distance_km = VALUES(distance_km)`,
    [
      input.workerId,
      input.workerId,
      input.dispatchStatus ?? "available",
      input.certified === false ? 0 : 1,
      input.distanceKm,
    ],
  );
  await getMysqlPool().query(
    `INSERT INTO worker_city_bindings (worker_id, city_code, is_enabled)
     VALUES (?, ?, 1)
     ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled)`,
    [input.workerId, cityCode],
  );
  await getMysqlPool().query(
    `INSERT INTO worker_online_status (worker_id, city_code, is_online)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE is_online = VALUES(is_online)`,
    [input.workerId, cityCode, input.online === false ? 0 : 1],
  );
  await getMysqlPool().query(
    `INSERT INTO worker_qualifications
      (worker_id, city_code, sku_id, is_eligible, source_certification_id)
     VALUES (?, ?, ?, 1, NULL)
     ON DUPLICATE KEY UPDATE is_eligible = VALUES(is_eligible)`,
    [input.workerId, cityCode, input.skuId],
  );
}

async function createQueuedTaskForSku(
  app: Awaited<ReturnType<typeof buildApp>>,
  skuId: string,
): Promise<{ orderId: string; dispatchTaskId: string }> {
  const orderId = await createOrderForDispatch(app, skuId);
  for (let i = 0; i < 20; i++) {
    await app.inject({
      method: "POST",
      url: "/api/internal/dispatch/run-once",
      headers: operatorHeaders,
      payload: {},
    });
    const [rows] = await getMysqlPool().query<
      (RowDataPacket & { dispatch_task_id: string })[]
    >(
      `SELECT dispatch_task_id
       FROM dispatch_tasks
       WHERE order_id = ? AND status = 'queued'
       LIMIT 1`,
      [orderId],
    );
    if (rows[0]?.dispatch_task_id) {
      return { orderId, dispatchTaskId: rows[0].dispatch_task_id };
    }
  }
  throw new Error(`Failed to create queued task for sku ${skuId}`);
}

async function runMatchOnce(
  app: Awaited<ReturnType<typeof buildApp>>,
  dispatchTaskId: string,
): Promise<void> {
  const res = await app.inject({
    method: "POST",
    url: "/api/internal/dispatch/match-once",
    headers: operatorHeaders,
    payload: { dispatchTaskId },
  });
  expect(res.statusCode).toBe(200);
}

async function taskStatus(dispatchTaskId: string): Promise<string> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
    `SELECT status FROM dispatch_tasks WHERE dispatch_task_id = ?`,
    [dispatchTaskId],
  );
  return rows[0]?.status ?? "";
}

async function taskReason(dispatchTaskId: string): Promise<string | null> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { last_reason: string | null })[]>(
    `SELECT last_reason FROM dispatch_tasks WHERE dispatch_task_id = ?`,
    [dispatchTaskId],
  );
  return rows[0]?.last_reason ?? null;
}

async function offerRows(dispatchTaskId: string): Promise<
  (RowDataPacket & { worker_id: string; status: string; distance_km: string | null })[]
> {
  const [rows] = await getMysqlPool().query<
    (RowDataPacket & { worker_id: string; status: string; distance_km: string | null })[]
  >(
    `SELECT worker_id, status, distance_km
     FROM dispatch_offers
     WHERE dispatch_task_id = ?
     ORDER BY offered_at ASC, distance_km ASC, worker_id ASC`,
    [dispatchTaskId],
  );
  return rows;
}

async function eventTypes(dispatchTaskId: string): Promise<string[]> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { event_type: string })[]>(
    `SELECT event_type
     FROM dispatch_events
     WHERE dispatch_task_id = ?
     ORDER BY created_at ASC, dispatch_event_id ASC`,
    [dispatchTaskId],
  );
  return rows.map((row) => row.event_type);
}

describe.skipIf(!runDb)("dispatchRunOnce integration", { timeout: 60000 }, () => {
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

  it("is idempotent and covers dispatch simulation scenarios", async () => {
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

    const normalSku = "sku_home_daily_3h";
    await clearSkuEligibility(normalSku);
    const normalA = workerId("normal-a");
    const normalB = workerId("normal-b");
    await ensureCandidateWorker({ workerId: normalA, skuId: normalSku, distanceKm: 2 });
    await ensureCandidateWorker({ workerId: normalB, skuId: normalSku, distanceKm: 5 });
    const normal = await createQueuedTaskForSku(app, normalSku);
    await runMatchOnce(app, normal.dispatchTaskId);
    const normalOffers = await offerRows(normal.dispatchTaskId);
    expect(normalOffers.map((offer) => offer.worker_id)).toEqual([normalA, normalB]);
    const normalAccept = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${normal.dispatchTaskId}/accept`,
      headers: workerHeaders(normalA),
      payload: {},
    });
    expect(normalAccept.statusCode).toBe(200);
    expect(await taskStatus(normal.dispatchTaskId)).toBe("accepted");
    expect(await eventTypes(normal.dispatchTaskId)).toEqual(
      expect.arrayContaining(["OFFER_CREATED", "WORKER_ACCEPTED", "OFFER_CANCELLED"]),
    );

    const noMatchSku = "sku_home_daily_3room";
    await clearSkuEligibility(noMatchSku);
    const noMatch = await createQueuedTaskForSku(app, noMatchSku);
    await runMatchOnce(app, noMatch.dispatchTaskId);
    expect(await taskStatus(noMatch.dispatchTaskId)).toBe("no_match");
    expect(await taskReason(noMatch.dispatchTaskId)).toBe("正在寻找服务人员");
    expect(await eventTypes(noMatch.dispatchTaskId)).toContain("NO_MATCH");

    const rejectSku = "sku_home_daily_4h";
    await clearSkuEligibility(rejectSku);
    const rejectA = workerId("reject-a");
    const rejectB = workerId("reject-b");
    await ensureCandidateWorker({ workerId: rejectA, skuId: rejectSku, distanceKm: 1 });
    await ensureCandidateWorker({ workerId: rejectB, skuId: rejectSku, distanceKm: 3 });
    const rejectCase = await createQueuedTaskForSku(app, rejectSku);
    await runMatchOnce(app, rejectCase.dispatchTaskId);
    const rejectRes = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${rejectCase.dispatchTaskId}/reject`,
      headers: workerHeaders(rejectA),
      payload: { reason: "not available" },
    });
    expect(rejectRes.statusCode).toBe(200);
    const rejectAccept = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${rejectCase.dispatchTaskId}/accept`,
      headers: workerHeaders(rejectB),
      payload: {},
    });
    expect(rejectAccept.statusCode).toBe(200);
    expect(await eventTypes(rejectCase.dispatchTaskId)).toEqual(
      expect.arrayContaining(["WORKER_REJECTED", "WORKER_ACCEPTED"]),
    );

    const timeoutSku = "sku_home_daily_1room";
    await clearSkuEligibility(timeoutSku);
    const timeoutA = workerId("timeout-a");
    const timeoutB = workerId("timeout-b");
    await ensureCandidateWorker({ workerId: timeoutA, skuId: timeoutSku, distanceKm: 1 });
    const timeoutCase = await createQueuedTaskForSku(app, timeoutSku);
    await runMatchOnce(app, timeoutCase.dispatchTaskId);
    await ensureCandidateWorker({ workerId: timeoutB, skuId: timeoutSku, distanceKm: 2 });
    const timeoutRes = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${timeoutCase.dispatchTaskId}/simulate-timeout`,
      headers: workerHeaders(timeoutA),
      payload: {},
    });
    expect(timeoutRes.statusCode).toBe(200);
    const timeoutOffers = await offerRows(timeoutCase.dispatchTaskId);
    expect(timeoutOffers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ worker_id: timeoutA, status: "timeout" }),
        expect.objectContaining({ worker_id: timeoutB, status: "offering" }),
      ]),
    );
    expect(await eventTypes(timeoutCase.dispatchTaskId)).toEqual(
      expect.arrayContaining(["OFFER_TIMEOUT", "REASSIGNING", "OFFER_CREATED"]),
    );

    const competitionSku = "sku_home_daily_2room";
    await clearSkuEligibility(competitionSku);
    const competitionA = workerId("compete-a");
    const competitionB = workerId("compete-b");
    await ensureCandidateWorker({ workerId: competitionA, skuId: competitionSku, distanceKm: 1 });
    await ensureCandidateWorker({ workerId: competitionB, skuId: competitionSku, distanceKm: 2 });
    const competition = await createQueuedTaskForSku(app, competitionSku);
    await runMatchOnce(app, competition.dispatchTaskId);
    const firstAccept = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${competition.dispatchTaskId}/accept`,
      headers: workerHeaders(competitionA),
      payload: {},
    });
    expect(firstAccept.statusCode).toBe(200);
    const secondAccept = await app.inject({
      method: "POST",
      url: `/api/worker/tasks/${competition.dispatchTaskId}/accept`,
      headers: workerHeaders(competitionB),
      payload: {},
    });
    expect(secondAccept.statusCode).toBe(409);
    expect(await offerRows(competition.dispatchTaskId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ worker_id: competitionA, status: "accepted" }),
        expect.objectContaining({ worker_id: competitionB, status: "cancelled" }),
      ]),
    );

    const citySku = "sku_home_deep_1room";
    await clearSkuEligibility(citySku);
    await clearSkuEligibility(citySku, "shanghai");
    await ensureCandidateWorker({
      workerId: workerId("shanghai-only"),
      cityCode: "shanghai",
      skuId: citySku,
      distanceKm: 1,
    });
    const cityCase = await createQueuedTaskForSku(app, citySku);
    await runMatchOnce(app, cityCase.dispatchTaskId);
    expect(await taskStatus(cityCase.dispatchTaskId)).toBe("no_match");

    const skillSku = "sku_home_deep_2room";
    await clearSkuEligibility(skillSku);
    await ensureCandidateWorker({
      workerId: workerId("wrong-skill"),
      skuId: "sku_home_daily_2h",
      distanceKm: 1,
    });
    const skillCase = await createQueuedTaskForSku(app, skillSku);
    await runMatchOnce(app, skillCase.dispatchTaskId);
    expect(await taskStatus(skillCase.dispatchTaskId)).toBe("no_match");

    await app.close();
  });
});
