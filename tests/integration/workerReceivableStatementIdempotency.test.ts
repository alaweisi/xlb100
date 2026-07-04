import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createQueuedSettlement,
  generateWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement idempotency", { timeout: 60000 }, () => {
  it("does not duplicate statements, lines, or outbox on repeat generate", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable } = await createQueuedSettlement(app);
      const first = await generateWorkerReceivableStatements(app, payable.settlementPayableId);
      expect(first.statusCode).toBe(200);
      const statement = first.json().statements[0];
      const second = await generateWorkerReceivableStatements(app, payable.settlementPayableId);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({ ok: true, idempotent: true });
      expect(second.json().statements[0].generatedAt).toBe(statement.generatedAt);
      expect(second.json().statements[0].generatedBy).toBe(statement.generatedBy);

      const [statements] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT statement_id FROM worker_receivable_statements WHERE settlement_payable_id = ?",
        [payable.settlementPayableId],
      );
      expect(statements).toHaveLength(1);
      const [lines] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT line_id FROM worker_receivable_statement_lines WHERE statement_id = ?",
        [statement.statementId],
      );
      expect(lines).toHaveLength(payable.itemCount);
      const [outbox] = await getMysqlPool().query<RowDataPacket[]>(
        "SELECT event_id FROM event_outbox WHERE event_type = 'worker.receivable.statement.created' AND aggregate_id = ?",
        [statement.statementId],
      );
      expect(outbox).toHaveLength(1);
    } finally { await app.close(); }
  }));
});
