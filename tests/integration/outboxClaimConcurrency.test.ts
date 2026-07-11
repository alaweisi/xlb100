import { randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import type { OutboxEventType, RequestContext } from "@xlb/types";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { withTransaction } from "../../backend/src/dal/transaction.js";
import {
  EventOutboxRepository,
  type OutboxClaim,
} from "../../backend/src/events/eventOutbox.js";
import { DispatchService } from "../../backend/src/dispatch/dispatchService.js";
import { dispatchRepository } from "../../backend/src/dispatch/dispatchRepository.js";
import type { DispatchStreamPublisher } from "../../backend/src/streams/dispatchStreamPublisher.js";
import { createPaidOrderForDispatch } from "./helpers/dispatchTestHelper.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

const runDb = process.env.XLB_SKIP_DB_TESTS !== "1";
const prefix = `evt_p23b_${Date.now().toString(36)}_`;
const testEventType = "phase23b.test" as OutboxEventType;
const context: RequestContext = {
  traceId: "phase23b-outbox",
  appType: "admin",
  role: "operator",
  cityCode: "hangzhou",
  userId: "phase23b-test",
  requestStartedAt: new Date().toISOString(),
};

async function insertEvents(count: number, maxAttempts = 5): Promise<string[]> {
  const ids = Array.from({ length: count }, (_, index) => `${prefix}${index}_${randomUUID()}`);
  for (const id of ids) {
    await getMysqlPool().query(
      `INSERT INTO event_outbox
        (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status,max_attempts)
       VALUES (?, ?, 'test', ?, 'hangzhou', '{}', 'pending', ?)`,
      [id, testEventType, id, maxAttempts],
    );
  }
  return ids;
}

describe.skipIf(!runDb)("outbox atomic claims", { timeout: 30000 }, () => {
  afterEach(async () => {
    await getMysqlPool().query("DELETE FROM event_outbox WHERE event_id LIKE ?", [`${prefix}%`]);
  });

  it("uses SKIP LOCKED so concurrent consumers claim each event once", async () => {
    const ids = await insertEvents(64);
    const shanghaiNoise = `${prefix}shanghai_${randomUUID()}`;
    const typeNoise = `${prefix}other_${randomUUID()}`;
    await getMysqlPool().query(
      `INSERT INTO event_outbox
        (event_id,event_type,aggregate_type,aggregate_id,city_code,payload_json,status)
       VALUES (?,?,'test',?,'shanghai','{}','pending'),
              (?,'phase23b.other','test',?,'hangzhou','{}','pending')`,
      [shanghaiNoise, testEventType, shanghaiNoise, typeNoise, typeNoise],
    );
    const claims = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      new EventOutboxRepository(getMysqlPool()).claimEventsByType(
        context, "hangzhou", testEventType, `consumer-${index}`, 25,
      )));
    const all = claims.flat();
    const claimed = all.map((event) => event.eventId);
    expect(new Set(claimed).size).toBe(64);
    expect(new Set(claimed)).toEqual(new Set(ids));
    expect(new Set(all.map((event) => event.leaseOwner)).size).toBeGreaterThan(1);
    const [noise] = await getMysqlPool().query<(RowDataPacket & { event_id: string; status: string })[]>(
      "SELECT event_id,status FROM event_outbox WHERE event_id IN (?,?) ORDER BY event_id",
      [shanghaiNoise, typeNoise],
    );
    expect(noise).toHaveLength(2);
    expect(noise.every((row) => row.status === "pending")).toBe(true);
    expect(claimed).not.toContain(shanghaiNoise);
    expect(claimed).not.toContain(typeNoise);
  });

  it("requires owner, token, city and processing state for renew and ack", async () => {
    await insertEvents(1);
    const repository = new EventOutboxRepository(getMysqlPool());
    const [claim] = await repository.claimEventsByType(context, "hangzhou", testEventType, "owner-a", 1);
    expect(claim).toBeDefined();
    expect(await repository.renewClaim({ ...claim!, leaseToken: randomUUID() })).toBe(false);
    expect(await repository.renewClaim(claim!, 60)).toBe(true);
    const lost = { ...claim!, leaseOwner: "owner-b" } as OutboxClaim;
    expect(await withTransaction((connection) => repository.acknowledgeClaim(connection, lost))).toBe(false);
    expect(await withTransaction((connection) => repository.acknowledgeClaim(connection, claim!))).toBe(true);
    expect(await withTransaction((connection) => repository.acknowledgeClaim(connection, claim!))).toBe(false);
  });

  it("retries with a cleaned error then dead-letters at the row policy limit", async () => {
    const [id] = await insertEvents(1, 2);
    const repository = new EventOutboxRepository(getMysqlPool());
    const [first] = await repository.claimEventsByType(context, "hangzhou", testEventType, "retry-a", 1);
    expect(await repository.failClaim(first!, new Error("bad\n token=secret"))).toBe("retry_wait");
    await getMysqlPool().query("UPDATE event_outbox SET available_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE event_id=?", [id]);
    const [second] = await repository.claimEventsByType(context, "hangzhou", testEventType, "retry-b", 1);
    expect(await repository.failClaim(second!, Object.assign(new Error("still bad"), { code: "E_TEST" }))).toBe("dead_letter");
    const [rows] = await getMysqlPool().query<(RowDataPacket & { status: string; attempt_count: number; last_error_code: string; dead_lettered_at: Date | null })[]>(
      "SELECT status,attempt_count,last_error_code,dead_lettered_at FROM event_outbox WHERE event_id=?",
      [id],
    );
    expect(rows[0]).toMatchObject({ status: "dead_letter", attempt_count: 2, last_error_code: "E_TEST" });
    expect(rows[0]!.dead_lettered_at).toBeInstanceOf(Date);
  });

  it("reaps expired leases while stale claim tokens remain unable to mutate", async () => {
    const [id] = await insertEvents(1);
    const repository = new EventOutboxRepository(getMysqlPool());
    const [claim] = await repository.claimEventsByType(context, "hangzhou", testEventType, "crashed", 1);
    await getMysqlPool().query("UPDATE event_outbox SET lease_expires_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE event_id=?", [id]);
    expect(await withTransaction((connection) => repository.acknowledgeClaim(connection, claim!))).toBe(false);
    expect(await repository.failClaim(claim!, new Error("late before reaper"))).toBe("lost");
    expect(await repository.reapExpiredLeases("hangzhou")).toBeGreaterThanOrEqual(1);
    expect(await repository.failClaim(claim!, new Error("late failure"))).toBe("lost");
    const [rows] = await getMysqlPool().query<(RowDataPacket & { status: string; last_error_code: string })[]>(
      "SELECT status,last_error_code FROM event_outbox WHERE event_id=?",
      [id],
    );
    expect(rows[0]).toMatchObject({ status: "retry_wait", last_error_code: "LEASE_EXPIRED" });
  });

  it("does not claim rows whose attempt policy is already exhausted", async () => {
    const [id] = await insertEvents(1, 1);
    await getMysqlPool().query("UPDATE event_outbox SET attempt_count=max_attempts WHERE event_id=?", [id]);
    const repository = new EventOutboxRepository(getMysqlPool());
    await expect(repository.claimEventsByType(context, "hangzhou", testEventType, "never", 1)).resolves.toEqual([]);
  });

  it("recovers a failed dispatch publish without creating a second task", async () => {
    const app = await buildApp();
    try {
      const orderId = await createPaidOrderForDispatch(app);
      let targetAttempts = 0;
      const publish = vi.fn().mockImplementation(async (task: { orderId: string }) => {
        if (task.orderId === orderId && targetAttempts++ === 0) {
          throw Object.assign(new Error("redis unavailable"), { code: "E_REDIS" });
        }
        return `phase23b-stream-${randomUUID()}`;
      });
      const repository = new EventOutboxRepository(getMysqlPool());
      const service = new DispatchService(
        dispatchRepository,
        repository,
        { publish } as unknown as DispatchStreamPublisher,
      );
      await service.runDispatchOutboxOnce(context);
      const [failed] = await getMysqlPool().query<(RowDataPacket & { event_id: string; status: string })[]>(
        "SELECT event_id,status FROM event_outbox WHERE aggregate_id=? AND event_type='order.created'",
        [orderId],
      );
      expect(failed[0]!.status).toBe("retry_wait");
      await getMysqlPool().query("UPDATE event_outbox SET available_at=DATE_SUB(NOW(3), INTERVAL 1 SECOND) WHERE event_id=?", [failed[0]!.event_id]);
      const concurrent = await Promise.all([
        service.runDispatchOutboxOnce(context),
        service.runDispatchOutboxOnce(context),
      ]);
      expect(concurrent.reduce((sum, result) => sum + result.tasks.filter((task) => task.orderId === orderId).length, 0)).toBe(1);
      const [tasks] = await getMysqlPool().query<(RowDataPacket & { count: number; status: string })[]>(
        "SELECT COUNT(*) count,MAX(status) status FROM dispatch_tasks WHERE order_id=?",
        [orderId],
      );
      expect(tasks[0]).toMatchObject({ count: 1, status: "queued" });
      const [published] = await getMysqlPool().query<(RowDataPacket & { status: string; attempt_count: number })[]>(
        "SELECT status,attempt_count FROM event_outbox WHERE event_id=?",
        [failed[0]!.event_id],
      );
      expect(published[0]).toMatchObject({ status: "published", attempt_count: 2 });
      expect(targetAttempts).toBe(2);
    } finally {
      await app.close();
    }
  });

  it("keeps ledger business writes idempotent under concurrent consumers", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible();
    const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app);
      await Promise.all([runLedgerOnce(app), runLedgerOnce(app)]);
      const [accruals] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM ledger_accruals WHERE fulfillment_id=?",
        [fulfillmentId],
      );
      const [entries] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) count FROM ledger_entries WHERE source_id=? AND source_type='fulfillment.completed'",
        [fulfillmentId],
      );
      const [events] = await getMysqlPool().query<(RowDataPacket & { status: string; attempt_count: number })[]>(
        "SELECT status,attempt_count FROM event_outbox WHERE aggregate_id=? AND event_type='fulfillment.completed'",
        [fulfillmentId],
      );
      expect(Number(accruals[0]!.count)).toBe(1);
      expect(Number(entries[0]!.count)).toBe(3);
      expect(events[0]).toMatchObject({ status: "published", attempt_count: 1 });
    } finally {
      await app.close();
    }
  }));
});
