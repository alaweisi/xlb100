import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createApprovedStatementSettlement,
  createStatementReadySettlement,
  exportWorkerReceivableStatementOnce,
  getWorkerReceivableStatementExport,
  reviewWorkerReceivableStatementOnce,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement export idempotency", { timeout: 60000 }, () => {
  it("does not duplicate export or outbox on repeat", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createApprovedStatementSettlement(app);
      const first = await exportWorkerReceivableStatementOnce(app, statementId);
      expect(first.statusCode).toBe(200);
      const exportId = first.json().export.exportId as string;
      const exportedAt = first.json().export.exportedAt as string;
      const contentHash = first.json().export.contentHash as string;

      const second = await exportWorkerReceivableStatementOnce(app, statementId);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toMatchObject({
        idempotent: true,
        export: { exportId, exportedAt, contentHash },
      });

      const [exports] = await getMysqlPool().query<(RowDataPacket & { export_id: string })[]>(
        "SELECT export_id FROM worker_receivable_statement_exports WHERE statement_id = ?",
        [statementId],
      );
      expect(exports).toHaveLength(1);
    } finally { await app.close(); }
  }));

  it("returns conflict for rejected review export", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      await reviewWorkerReceivableStatementOnce(app, statementId, { decision: "rejected" });
      const response = await exportWorkerReceivableStatementOnce(app, statementId);
      expect(response.statusCode).toBe(409);
    } finally { await app.close(); }
  }));

  it("returns conflict when no review exists", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createStatementReadySettlement(app);
      const response = await exportWorkerReceivableStatementOnce(app, statementId);
      expect(response.statusCode).toBe(409);
    } finally { await app.close(); }
  }));
});

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement export city scoped", { timeout: 60000 }, () => {
  it("returns 404 for cross-city export", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { statementId } = await createApprovedStatementSettlement(app);
      const crossExport = await exportWorkerReceivableStatementOnce(app, statementId, "shanghai");
      expect(crossExport.statusCode).toBe(404);
      const crossGet = await getWorkerReceivableStatementExport(app, statementId, "shanghai");
      expect(crossGet.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement export missing statement", { timeout: 60000 }, () => {
  it("returns 404 for missing statement", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const response = await exportWorkerReceivableStatementOnce(app, "wrs_missing");
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
