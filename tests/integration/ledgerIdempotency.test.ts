import type { RowDataPacket } from "mysql2/promise";
import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("ledger idempotency", { timeout: 60000 }, () => {
  it("does not duplicate accruals or entries on retry", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app); await runLedgerOnce(app); await runLedgerOnce(app);
      const [accruals] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM ledger_accruals WHERE fulfillment_id=?", [fulfillmentId]);
      const [entries] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>("SELECT COUNT(*) AS count FROM ledger_entries WHERE source_id=?", [fulfillmentId]);
      expect(Number(accruals[0]!.count)).toBe(1); expect(Number(entries[0]!.count)).toBe(3);
      const [auditRows] = await getMysqlPool().query<(RowDataPacket & { payload_json: string | Record<string, unknown> })[]>(
        `SELECT eo.payload_json
         FROM event_outbox eo
         JOIN ledger_entries le ON le.entry_id = eo.aggregate_id AND le.city_code = eo.city_code
         WHERE eo.event_type = 'conflict_audit'
           AND eo.aggregate_type = 'ledger_entry'
           AND le.source_type = 'fulfillment.completed'
           AND le.source_id = ?
         ORDER BY JSON_UNQUOTE(JSON_EXTRACT(eo.payload_json, '$.fee_type'))`,
        [fulfillmentId],
      );
      expect(auditRows).toHaveLength(3);
      const auditPayloads = auditRows.map((row) =>
        typeof row.payload_json === "string" ? JSON.parse(row.payload_json) as Record<string, unknown> : row.payload_json,
      );
      expect(auditPayloads.map((payload) => payload.fee_type)).toEqual(["gross", "platform_fee", "worker_receivable"]);
      for (const payload of auditPayloads) {
        expect(payload).toMatchObject({ order_id: expect.any(String), source_type: "fulfillment.completed" });
        expect(payload.snapshot_hash).toMatch(/^[a-f0-9]{64}$/);
      }
    } finally { await app.close(); }
  }));

  it("single-write guard prevents duplicate order fee/source writes for a replayed completed event", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId, orderId } = await createCompletedFulfillment(app);
      await runLedgerOnce(app);

      const duplicateEventId = `evt_guard_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
      await getMysqlPool().query(
        `INSERT INTO event_outbox
          (event_id, event_type, aggregate_type, aggregate_id, city_code, payload_json, status)
         VALUES (?, 'fulfillment.completed', 'fulfillment', ?, 'hangzhou', ?, 'pending')`,
        [duplicateEventId, fulfillmentId, JSON.stringify({ fulfillmentId })],
      );

      const replay = await runLedgerOnce(app);
      expect(replay.statusCode).toBe(200);

      const [accruals] = await getMysqlPool().query<(RowDataPacket & { count: number })[]>(
        "SELECT COUNT(*) AS count FROM ledger_accruals WHERE city_code = 'hangzhou' AND order_id = ?",
        [orderId],
      );
      expect(Number(accruals[0]!.count)).toBe(1);

      const [entryRows] = await getMysqlPool().query<
        (RowDataPacket & { account_type: string; direction: string; count: number })[]
      >(
        `SELECT account_type, direction, COUNT(*) AS count
         FROM ledger_entries
         WHERE city_code = 'hangzhou'
           AND source_id = ?
           AND source_type = 'fulfillment.completed'
         GROUP BY account_type, direction`,
        [fulfillmentId],
      );
      expect(
        Object.fromEntries(
          entryRows.map((row) => [`${row.account_type}:${row.direction}`, Number(row.count)]),
        ),
      ).toEqual({ "customer:debit": 1, "platform:credit": 1, "worker:credit": 1 });

      const [events] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>(
        "SELECT status FROM event_outbox WHERE event_id = ? AND city_code = 'hangzhou'",
        [duplicateEventId],
      );
      expect(events[0]!.status).toBe("published");
    } finally { await app.close(); }
  }));
});
