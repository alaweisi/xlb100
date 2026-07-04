import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createLedgerAccrual, prepareSettlementOnce, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement batch items", { timeout: 60000 }, () => {
  it("lists city-scoped batch totals and source items", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const source = await createLedgerAccrual(app);
      const prepared = await prepareSettlementOnce(app);
      const batch = prepared.json().batch;
      const batches = await app.inject({ method: "GET", url: "/api/internal/settlement/batches", headers: settlementHeaders() });
      expect(batches.statusCode).toBe(200);
      expect(batches.json().batches).toEqual(expect.arrayContaining([expect.objectContaining({ settlementBatchId: batch.settlementBatchId })]));
      const items = await app.inject({ method: "GET", url: `/api/internal/settlement/batches/${batch.settlementBatchId}/items`, headers: settlementHeaders() });
      expect(items.statusCode).toBe(200);
      expect(items.json().items).toEqual(expect.arrayContaining([expect.objectContaining({ accrualId: source.accrualId })]));
      const sums = items.json().items.reduce((value: { gross: number; fee: number; worker: number }, item: { grossAmount: number; platformFee: number; workerReceivable: number }) => ({ gross: value.gross + item.grossAmount, fee: value.fee + item.platformFee, worker: value.worker + item.workerReceivable }), { gross: 0, fee: 0, worker: 0 });
      expect(batch.itemCount).toBe(items.json().items.length);
      expect(batch.totalGrossAmount).toBeCloseTo(sums.gross, 2);
      expect(batch.totalPlatformFee).toBeCloseTo(sums.fee, 2);
      expect(batch.totalWorkerReceivable).toBeCloseTo(sums.worker, 2);
    } finally { await app.close(); }
  }));
});
