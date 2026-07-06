import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createApprovedStatementSettlement,
  createQueuedSettlement,
  exportWorkerReceivableStatementOnce,
  generateWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

async function getStatementIdsForPayable(payableId: string): Promise<string[]> {
  const [rows] = await getMysqlPool().query<(RowDataPacket & { statement_id: string })[]>(
    "SELECT statement_id FROM worker_receivable_statements WHERE city_code = 'hangzhou' AND settlement_payable_id = ?",
    [payableId],
  );
  return rows.map((row) => row.statement_id);
}

async function getStatementAuditAggregateIds(statementId: string): Promise<string[]> {
  const pool = getMysqlPool();
  const [reviews] = await pool.query<(RowDataPacket & { review_id: string })[]>(
    "SELECT review_id FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou' AND statement_id = ?",
    [statementId],
  );
  const [exports] = await pool.query<(RowDataPacket & { export_id: string })[]>(
    "SELECT export_id FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou' AND statement_id = ?",
    [statementId],
  );
  return [
    statementId,
    ...reviews.map((row) => row.review_id),
    ...exports.map((row) => row.export_id),
  ];
}

async function countOutboxForAggregates(aggregateIds: string[]): Promise<number> {
  if (aggregateIds.length === 0) return 0;
  const placeholders = aggregateIds.map(() => "?").join(", ");
  const [rows] = await getMysqlPool().query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM event_outbox WHERE city_code = 'hangzhou' AND aggregate_id IN (${placeholders})`,
    aggregateIds,
  );
  return Number((rows[0] as any).cnt);
}

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "worker receivable statement audit read-only invariant",
  { timeout: 60000 },
  () => {
    it("does not change statement count after audit list query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const pool = getMysqlPool();
          const [before] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const beforeCount = Number((before[0] as any).cnt);

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [after] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const afterCount = Number((after[0] as any).cnt);
          expect(afterCount).toBe(beforeCount);
        } finally {
          await app.close();
        }
      }));

    it("does not change review count after audit list query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const pool = getMysqlPool();
          const [before] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const beforeCount = Number((before[0] as any).cnt);

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [after] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const afterCount = Number((after[0] as any).cnt);
          expect(afterCount).toBe(beforeCount);
        } finally {
          await app.close();
        }
      }));

    it("does not change export count after audit list query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const pool = getMysqlPool();
          const [before] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const beforeCount = Number((before[0] as any).cnt);

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [after] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const afterCount = Number((after[0] as any).cnt);
          expect(afterCount).toBe(beforeCount);
        } finally {
          await app.close();
        }
      }));

    it("does not change outbox count after audit list query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);
          const aggregateIds = await getStatementIdsForPayable(payable.settlementPayableId);

          const pool = getMysqlPool();
          const beforeCount = await countOutboxForAggregates(aggregateIds);

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const afterCount = await countOutboxForAggregates(aggregateIds);
          expect(afterCount).toBe(beforeCount);
        } finally {
          await app.close();
        }
      }));

    it("does not change content_hash after audit list query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const pool = getMysqlPool();
          const [before] = await pool.query<RowDataPacket[]>(
            "SELECT content_hash FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou' LIMIT 1",
          );
          const beforeHash = (before[0] as any)?.content_hash;

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [after] = await pool.query<RowDataPacket[]>(
            "SELECT content_hash FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou' LIMIT 1",
          );
          const afterHash = (after[0] as any)?.content_hash;
          expect(afterHash).toBe(beforeHash);
        } finally {
          await app.close();
        }
      }));

    it("does not change statement/review/export/outbox counts after audit detail", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);
          const aggregateIds = await getStatementAuditAggregateIds(statementId);

          const pool = getMysqlPool();
          const [beforeStmt] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const [beforeReview] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const [beforeExport] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const beforeOutboxCount = await countOutboxForAggregates(aggregateIds);

          await app.inject({
            method: "GET",
            url: `/api/internal/settlement/worker-statement-audit/${statementId}`,
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [afterStmt] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const [afterReview] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const [afterExport] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const afterOutboxCount = await countOutboxForAggregates(aggregateIds);

          expect(Number((afterStmt[0] as any).cnt)).toBe(Number((beforeStmt[0] as any).cnt));
          expect(Number((afterReview[0] as any).cnt)).toBe(Number((beforeReview[0] as any).cnt));
          expect(Number((afterExport[0] as any).cnt)).toBe(Number((beforeExport[0] as any).cnt));
          expect(afterOutboxCount).toBe(beforeOutboxCount);
        } finally {
          await app.close();
        }
      }));

    it("does not change statement/review/export/outbox counts after export audit list", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);
          const aggregateIds = await getStatementAuditAggregateIds(statementId);

          const pool = getMysqlPool();
          const [beforeStmt] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const [beforeReview] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const [beforeExport] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const beforeOutboxCount = await countOutboxForAggregates(aggregateIds);

          await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-export-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          const [afterStmt] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statements WHERE city_code = 'hangzhou'",
          );
          const [afterReview] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_reviews WHERE city_code = 'hangzhou'",
          );
          const [afterExport] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM worker_receivable_statement_exports WHERE city_code = 'hangzhou'",
          );
          const afterOutboxCount = await countOutboxForAggregates(aggregateIds);

          expect(Number((afterStmt[0] as any).cnt)).toBe(Number((beforeStmt[0] as any).cnt));
          expect(Number((afterReview[0] as any).cnt)).toBe(Number((beforeReview[0] as any).cnt));
          expect(Number((afterExport[0] as any).cnt)).toBe(Number((beforeExport[0] as any).cnt));
          expect(afterOutboxCount).toBe(beforeOutboxCount);
        } finally {
          await app.close();
        }
      }));
  },
);
