import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  createApprovedStatementSettlement,
  createQueuedSettlement,
  createStatementReadySettlement,
  exportWorkerReceivableStatementOnce,
  generateWorkerReceivableStatements,
  reviewWorkerReceivableStatementOnce,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "worker receivable statement review summary",
  { timeout: 60000 },
  () => {
    it("returns correct review summary counts with default query", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          // Create statement with approved review + export
          const { statementId: exportedStatementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, exportedStatementId);

          // Create statement with rejected review (no export)
          const { statementId: rejectedStatementId } = await createStatementReadySettlement(app);
          await reviewWorkerReceivableStatementOnce(app, rejectedStatementId, {
            decision: "rejected",
            reviewNote: "mismatch",
          });

          // Create statement with no review (pending)
          const { payable: payable2 } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable2.settlementPayableId);

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(body.cityCode).toBe("hangzhou");
          expect(body.groups).toBeNull();

          // We should have at least 3 statements total
          expect(body.overall.totalStatements).toBeGreaterThanOrEqual(3);
          expect(body.overall.reviewedStatements).toBeGreaterThanOrEqual(2);
          expect(body.overall.approvedStatements).toBeGreaterThanOrEqual(1);
          expect(body.overall.rejectedStatements).toBeGreaterThanOrEqual(1);
          expect(body.overall.pendingReviewStatements).toBeGreaterThanOrEqual(1);
          expect(body.overall.exportedStatements).toBeGreaterThanOrEqual(1);
          // approved but not yet exported
          expect(body.overall.pendingExportStatements).toBeGreaterThanOrEqual(0);
          // statements without export (rejected + pending review)
          expect(body.overall.noExportStatements).toBeGreaterThanOrEqual(2);
        } finally {
          await app.close();
        }
      }));

    it("returns grouped summary with groupBy=worker", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Create another statement with rejected review
          const { statementId: rejectedStatementId } = await createStatementReadySettlement(app);
          await reviewWorkerReceivableStatementOnce(app, rejectedStatementId, {
            decision: "rejected",
          });

          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary?groupBy=worker",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(body.groups).not.toBeNull();
          expect(body.groups!.length).toBeGreaterThanOrEqual(1);

          // Each group should have a workerId and counts
          for (const group of body.groups!) {
            expect(group).toHaveProperty("workerId");
            expect(group).toHaveProperty("counts");
            expect(group.counts).toHaveProperty("totalStatements");
            expect(group.counts).toHaveProperty("reviewedStatements");
            expect(group.counts).toHaveProperty("approvedStatements");
            expect(group.counts).toHaveProperty("rejectedStatements");
            expect(group.counts).toHaveProperty("pendingReviewStatements");
            expect(group.counts).toHaveProperty("exportedStatements");
            expect(group.counts).toHaveProperty("pendingExportStatements");
            expect(group.counts).toHaveProperty("noExportStatements");
          }

          // overall should aggregate all group counts
          const groupTotals = body.groups!.reduce(
            (acc: Record<string, number>, g: any) => {
              for (const key of Object.keys(g.counts)) {
                acc[key] = (acc[key] || 0) + g.counts[key];
              }
              return acc;
            },
            {} as Record<string, number>,
          );
          expect(body.overall.totalStatements).toBe(groupTotals.totalStatements);
          expect(body.overall.reviewedStatements).toBe(groupTotals.reviewedStatements);
          expect(body.overall.approvedStatements).toBe(groupTotals.approvedStatements);
        } finally {
          await app.close();
        }
      }));

    it("returns 400 for invalid groupBy value", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary?groupBy=invalid",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          expect(response.statusCode).toBe(400);
          const body = response.json();
          expect(body.ok).toBe(false);
        } finally {
          await app.close();
        }
      }));

    it("supports dateFrom and dateTo filtering", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          // Create data
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Use dateFrom in the future — should get no results
          const farFuture = "2099-01-01";
          const response = await app.inject({
            method: "GET",
            url: `/api/internal/settlement/worker-statement-review-summary?dateFrom=${farFuture}&dateTo=2099-12-31`,
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
          expect(body.dateFrom).toBe(farFuture);
          expect(body.dateTo).toBe("2099-12-31");
          // No statements in that date range
          expect(body.overall.totalStatements).toBe(0);
          expect(body.overall.reviewedStatements).toBe(0);
          expect(body.overall.approvedStatements).toBe(0);
          expect(body.overall.rejectedStatements).toBe(0);
          expect(body.overall.pendingReviewStatements).toBe(0);
          expect(body.overall.exportedStatements).toBe(0);
          expect(body.overall.pendingExportStatements).toBe(0);
          expect(body.overall.noExportStatements).toBe(0);
        } finally {
          await app.close();
        }
      }));

    it("returns 400 for missing cityCode", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "",
              "x-xlb-user-id": "operator",
            },
          });

          expect(response.statusCode).toBe(400);
          const body = response.json();
          expect(body.ok).toBe(false);
        } finally {
          await app.close();
        }
      }));
  },
);
