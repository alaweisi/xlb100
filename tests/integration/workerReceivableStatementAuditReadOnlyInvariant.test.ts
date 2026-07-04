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

          const pool = getMysqlPool();
          const [before] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM event_outbox",
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
            "SELECT COUNT(*) AS cnt FROM event_outbox",
          );
          const afterCount = Number((after[0] as any).cnt);
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
          const [beforeOutbox] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM event_outbox",
          );

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
          const [afterOutbox] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM event_outbox",
          );

          expect(Number((afterStmt[0] as any).cnt)).toBe(Number((beforeStmt[0] as any).cnt));
          expect(Number((afterReview[0] as any).cnt)).toBe(Number((beforeReview[0] as any).cnt));
          expect(Number((afterExport[0] as any).cnt)).toBe(Number((beforeExport[0] as any).cnt));
          expect(Number((afterOutbox[0] as any).cnt)).toBe(Number((beforeOutbox[0] as any).cnt));
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
          const [beforeOutbox] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM event_outbox",
          );

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
          const [afterOutbox] = await pool.query<RowDataPacket[]>(
            "SELECT COUNT(*) AS cnt FROM event_outbox",
          );

          expect(Number((afterStmt[0] as any).cnt)).toBe(Number((beforeStmt[0] as any).cnt));
          expect(Number((afterReview[0] as any).cnt)).toBe(Number((beforeReview[0] as any).cnt));
          expect(Number((afterExport[0] as any).cnt)).toBe(Number((beforeExport[0] as any).cnt));
          expect(Number((afterOutbox[0] as any).cnt)).toBe(Number((beforeOutbox[0] as any).cnt));
        } finally {
          await app.close();
        }
      }));
  },
);
