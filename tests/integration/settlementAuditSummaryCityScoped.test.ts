import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createQueuedSettlement, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")(
  "settlement audit summary city scope",
  { timeout: 60000 },
  () => {
    it("shanghai cannot see hangzhou data", () =>
      withSettlementTestLock(async () => {
        const app = await buildApp();
        try {
          await createQueuedSettlement(app);
          const res = await app.inject({
            method: "GET",
            url: "/api/internal/settlement/settlement-audit-summary",
            headers: { "x-xlb-app-type": "admin", "x-xlb-role": "operator", "x-xlb-city-code": "shanghai", "x-xlb-user-id": "op" },
          });
          expect(res.statusCode).toBe(200);
          const body = res.json();
          expect(body.counts.totalBatches).toBe(0);
        } finally { await app.close(); }
      }));
  },
);
