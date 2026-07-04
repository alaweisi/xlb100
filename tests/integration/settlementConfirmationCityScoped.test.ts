import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { confirmSettlementBatch, createPreparedSettlement, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement confirmation city scope", { timeout: 60000 }, () => {
  it("does not confirm or expose another city's batch", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createPreparedSettlement(app);
      expect((await confirmSettlementBatch(app, batch.settlementBatchId, "shanghai")).statusCode).toBe(404);
      const crossRead = await app.inject({ method: "GET", url: `/api/internal/settlement/batches/${batch.settlementBatchId}/items`, headers: settlementHeaders("shanghai") });
      expect(crossRead.statusCode).toBe(404);
      const confirmed = await confirmSettlementBatch(app, batch.settlementBatchId);
      expect(confirmed.json().batch.status).toBe("confirmed");
    } finally { await app.close(); }
  }));
});
