import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createConfirmedSettlement, getSettlementPayable, markSettlementPayable, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable city scope", { timeout: 60000 }, () => {
  it("does not mark or expose another city's payable", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createConfirmedSettlement(app);
      expect((await markSettlementPayable(app, batch.settlementBatchId, "shanghai")).statusCode).toBe(404);
      await markSettlementPayable(app, batch.settlementBatchId);
      expect((await getSettlementPayable(app, batch.settlementBatchId, "shanghai")).statusCode).toBe(404);
      const crossRead = await app.inject({
        method: "GET",
        url: `/api/internal/settlement/batches/${batch.settlementBatchId}/payable`,
        headers: settlementHeaders("shanghai"),
      });
      expect(crossRead.statusCode).toBe(404);
      expect((await getSettlementPayable(app, batch.settlementBatchId)).json().payable.status).toBe("payable");
    } finally { await app.close(); }
  }));
});
