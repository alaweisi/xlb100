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
  "worker receivable statement review summary city scoped",
  { timeout: 60000 },
  () => {
    it("does not expose another city's review summary data", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          // Create statements and reviews in hangzhou
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Additional un-reviewed statement
          const { payable: payable2 } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable2.settlementPayableId);

          // Shanghai should see empty counts
          const shanghaiSummary = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "shanghai",
              "x-xlb-user-id": "operator-shanghai",
            },
          });

          expect(shanghaiSummary.statusCode).toBe(200);
          const body = shanghaiSummary.json();
          expect(body.ok).toBe(true);
          expect(body.cityCode).toBe("shanghai");

          // Shanghai should see zero counts — no data created in shanghai
          expect(body.overall.totalStatements).toBe(0);
          expect(body.overall.reviewedStatements).toBe(0);
          expect(body.overall.approvedStatements).toBe(0);
          expect(body.overall.rejectedStatements).toBe(0);
          expect(body.overall.pendingReviewStatements).toBe(0);
          expect(body.overall.exportedStatements).toBe(0);
          expect(body.overall.pendingExportStatements).toBe(0);
          expect(body.overall.noExportStatements).toBe(0);
          expect(body.groups).toBeNull();

          // Hangzhou should still see its own data
          const hangzhouSummary = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "hangzhou",
              "x-xlb-user-id": "operator-hangzhou",
            },
          });

          expect(hangzhouSummary.statusCode).toBe(200);
          const hangzhouBody = hangzhouSummary.json();
          expect(hangzhouBody.overall.totalStatements).toBeGreaterThanOrEqual(2);
          expect(hangzhouBody.overall.approvedStatements).toBeGreaterThanOrEqual(1);
          expect(hangzhouBody.overall.pendingReviewStatements).toBeGreaterThanOrEqual(1);
          expect(hangzhouBody.overall.exportedStatements).toBeGreaterThanOrEqual(1);
        } finally {
          await app.close();
        }
      }));

    it("returns empty counts when no data exists in the city", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          // Create data only in hangzhou
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Shanghai should see empty counts
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-review-summary",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "shanghai",
              "x-xlb-user-id": "operator-shanghai",
            },
          });

          expect(response.statusCode).toBe(200);
          const body = response.json();
          expect(body.ok).toBe(true);
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

    it("returns 400 when missing cityCode", () =>
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
