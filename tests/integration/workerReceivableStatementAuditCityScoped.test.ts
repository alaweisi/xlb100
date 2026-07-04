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
  "worker receivable statement audit city scope",
  { timeout: 60000 },
  () => {
    it("does not expose another city's statement audit detail", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Shanghai cannot see hangzhou's detail
          const detail = await app.inject({
            method: "GET",
            url: `/api/internal/settlement/worker-statement-audit/${statementId}`,
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "shanghai",
              "x-xlb-user-id": "operator-shanghai",
            },
          });
          expect(detail.statusCode).toBe(404);
        } finally {
          await app.close();
        }
      }));

    it("does not expose another city's statements in audit list", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { payable } = await createQueuedSettlement(app);
          await generateWorkerReceivableStatements(app, payable.settlementPayableId);

          // Shanghai list should not include hangzhou data
          const list = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "shanghai",
              "x-xlb-user-id": "operator-shanghai",
            },
          });
          expect(list.statusCode).toBe(200);
          const body = list.json();
          expect(body.ok).toBe(true);
          // Shanghai has no statements, so list should be empty
          expect(body.items).toHaveLength(0);
        } finally {
          await app.close();
        }
      }));

    it("does not expose another city's export audit", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const { statementId } = await createApprovedStatementSettlement(app);
          await exportWorkerReceivableStatementOnce(app, statementId);

          // Shanghai cannot see hangzhou's exports
          const list = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-export-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "shanghai",
              "x-xlb-user-id": "operator-shanghai",
            },
          });
          expect(list.statusCode).toBe(200);
          const body = list.json();
          expect(body.ok).toBe(true);
          expect(body.items).toHaveLength(0);
        } finally {
          await app.close();
        }
      }));

    it("returns 400 when missing cityCode on audit list", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "",
              "x-xlb-user-id": "operator",
            },
          });
          expect(response.statusCode).toBe(400);
        } finally {
          await app.close();
        }
      }));

    it("returns 400 when missing cityCode on audit detail", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const response = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/worker-statement-audit/wrs-1",
            headers: {
              "x-xlb-app-type": "admin",
              "x-xlb-role": "operator",
              "x-xlb-city-code": "",
              "x-xlb-user-id": "operator",
            },
          });
          expect(response.statusCode).toBe(400);
        } finally {
          await app.close();
        }
      }));
  },
);
