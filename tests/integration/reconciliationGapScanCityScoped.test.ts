import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createQueuedSettlement, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "reconciliation gap scan city scope",
  { timeout: 60000 },
  () => {
    it("shanghai cannot see hangzhou gaps", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          // Create a settlement in hangzhou
          await createQueuedSettlement(app);
          // Query from shanghai — should see zero gaps (or at least no hangzhou gaps)
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/reconciliation-gap-scan",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "shanghai", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.ok).toBe(true);
          // Shanghai should not see any gaps that belong to hangzhou
          for (const gap of body.gaps) {
            expect(gap.cityCode).toBe("shanghai");
          }
        } finally { await app.close(); }
      }));
  },
);
