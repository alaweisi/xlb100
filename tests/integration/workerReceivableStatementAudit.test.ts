import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import {
  createApprovedStatementSettlement,
  createQueuedSettlement,
  createStatementReadySettlement,
  exportWorkerReceivableStatementOnce,
  generateWorkerReceivableStatements,
  getWorkerReceivableStatementExport,
  reviewWorkerReceivableStatementOnce,
  settlementHeaders,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "worker receivable statement audit",
  { timeout: 60000 },
  () => {
    it("lists statement audit with default limit", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(Array.isArray(body.items)).toBe(true);
          expect(body.items.length).toBeGreaterThanOrEqual(1);
          expect(body.items[0]).toMatchObject({
            cityCode: "hangzhou",
            status: "created",
          });
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by workerId", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?workerId=worker-1",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            expect(item.workerId).toBe("worker-1");
          }
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by reviewDecision", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createStatementReadySettlement(app);
          await reviewWorkerReceivableStatementOnce(app, statementId, {
            decision: "approved",
          });

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?reviewDecision=approved",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            if (item.review) {
              expect(item.review.decision).toBe("approved");
            }
          }
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by hasReview=true", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createStatementReadySettlement(app);
          await reviewWorkerReceivableStatementOnce(app, statementId, {
            decision: "approved",
          });

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?hasReview=true",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            expect(item.review).not.toBeNull();
          }
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by hasExport=true", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?hasExport=true",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            expect(item.export).not.toBeNull();
          }
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by hasReview=false", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?hasReview=false",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            expect(item.review).toBeNull();
          }
        } finally {
          await app.close();
        }
      }));

    it("lists statement audit filtered by date ranges", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const from = "2020-01-01T00:00:00.000Z";
          const to = "2099-12-31T23:59:59.000Z";

          const response = await app.inject({
            method: "GET",
            url: `/api/internal/settlement/worker-statement-audit?statementCreatedFrom=${from}&statementCreatedTo=${to}`,
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(body.items.length).toBeGreaterThanOrEqual(1);
        } finally {
          await app.close();
        }
      }));

    it("paginates statement audit with cursor", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          const first = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?limit=1",
            headers: settlementHeaders("hangzhou"),
          });
          expect(first.statusCode).toBe(200);
          const firstBody = first.json();
          expect(firstBody.items.length).toBeLessThanOrEqual(1);

          if (firstBody.nextCursor) {
            const second = await app.inject({
              method: "GET",
              url: `/api/internal/settlement/worker-statement-audit?cursor=${encodeURIComponent(firstBody.nextCursor)}&limit=1`,
              headers: settlementHeaders("hangzhou"),
            });
            expect(second.statusCode).toBe(200);
            const secondBody = second.json();
            expect(Array.isArray(secondBody.items)).toBe(true);
          }
        } finally {
          await app.close();
        }
      }));

    it("returns statement audit detail with review and export", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const response = await app.inject({
            method: "GET",
            url: `/api/internal/settlement/worker-statement-audit/${statementId}`,
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(body.statement).toBeDefined();
          expect(body.statement.statementId).toBe(statementId);
          expect(body.review).not.toBeNull();
          expect(body.review.decision).toBe("approved");
          expect(body.export).not.toBeNull();
          expect(body.export.exportFormat).toBe("internal_v1");
        } finally {
          await app.close();
        }
      }));

    it("returns 404 for missing statement audit detail", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit/wrs-nonexistent",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(404);
        } finally {
          await app.close();
        }
      }));

    it("lists export audit", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-export-audit",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(Array.isArray(body.items)).toBe(true);
          expect(body.items.length).toBeGreaterThanOrEqual(1);
          expect(body.items[0]).toMatchObject({
            cityCode: "hangzhou",
            statementId,
            exportFormat: "internal_v1",
          });
        } finally {
          await app.close();
        }
      }));

    it("lists export audit filtered by workerId", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-export-audit?workerId=worker-1",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          for (const item of body.items) {
            expect(item.workerId).toBe("worker-1");
          }
        } finally {
          await app.close();
        }
      }));

    it("returns 400 on missing cityCode for statement audit list", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: settlementHeaders(""),
          });
          expect(response.statusCode).toBe(400);
        } finally {
          await app.close();
        }
      }));

    it("returns 400 for invalid query parameters", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit?limit=999",
            headers: settlementHeaders("hangzhou"),
          });
          expect(response.statusCode).toBe(400);
          expect(response.json().error).toBe("invalid audit query parameters");
        } finally {
          await app.close();
        }
      }));
  },
);
