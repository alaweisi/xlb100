import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createQueuedSettlement, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "settlement audit summary",
  { timeout: 60000 },
  () => {
    it("returns counts and status breakdown", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/settlement-audit-summary",
            headers: settlementHeaders("hangzhou"),
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.ok).toBe(true);
          expect(body.counts.totalBatches).toBeGreaterThanOrEqual(1);
          expect(body.counts.totalItems).toBeGreaterThanOrEqual(1);
          expect(Array.isArray(body.statusBreakdown)).toBe(true);
          expect(body.amounts.itemsGrossAmount).toBeGreaterThan(0);
        } finally { await app.close(); }
      }));

    it("supports groupBy=batch", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/settlement-audit-summary?groupBy=batch",
            headers: settlementHeaders("hangzhou"),
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(Array.isArray(body.groups)).toBe(true);
          expect(body.groups.length).toBeGreaterThanOrEqual(1);
        } finally { await app.close(); }
      }));
  },
);
