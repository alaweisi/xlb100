import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { ensureHangzhouWorkerEligible } from "./helpers/acceptTestHelper.js";
import { createCompletedFulfillment, ledgerOperatorHeaders, runLedgerOnce, withLedgerTestLock } from "./helpers/ledgerTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("ledger city scope", { timeout: 60000 }, () => {
  it("does not expose Hangzhou accruals to Shanghai", () => withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible(); const app = await buildApp();
    try {
      const { fulfillmentId } = await createCompletedFulfillment(app); await runLedgerOnce(app);
      const response = await app.inject({ method: "GET", url: "/api/internal/ledger/accruals", headers: { ...ledgerOperatorHeaders, "x-xlb-city-code": "shanghai" } });
      expect(response.statusCode).toBe(200);
      expect(response.json().accruals.some((item: { fulfillmentId: string }) => item.fulfillmentId === fulfillmentId)).toBe(false);
    } finally { await app.close(); }
  }));
});
