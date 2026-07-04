import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createQueuedSettlement, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "reconciliation gap scan",
  { timeout: 60000 },
  () => {
    it("returns gaps array and summary counts", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/reconciliation-gap-scan",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.ok).toBe(true);
          expect(Array.isArray(body.gaps)).toBe(true);
          expect(body.summary.totalGaps).toBeGreaterThanOrEqual(0);
          expect(typeof body.summary.gapsByType).toBe("object");
        } finally { await app.close(); }
      }));

    it("supports gapType=payable-queue filter", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/reconciliation-gap-scan?gapType=payable-queue",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.ok).toBe(true);
          expect(Array.isArray(body.gaps)).toBe(true);
          if (body.gaps.length > 0) {
            body.gaps.forEach((g: { type: string }) => {
              expect(g.type).toBe("payable-queue");
            });
          }
          expect(body.summary.totalGaps).toBeGreaterThanOrEqual(0);
        } finally { await app.close(); }
      }));

    it("supports gapType=batch-payable filter", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/reconciliation-gap-scan?gapType=batch-payable",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.ok).toBe(true);
          expect(Array.isArray(body.gaps)).toBe(true);
        } finally { await app.close(); }
      }));

    it("returns 400 for invalid gapType", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/reconciliation-gap-scan?gapType=invalid",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "hangzhou", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(400);
        } finally { await app.close(); }
      }));
  },
);
