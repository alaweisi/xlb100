import type { RowDataPacket } from "mysql2/promise";
import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { getMysqlPool } from "../../backend/src/dal/mysqlPool.js";
import { confirmSettlementBatch, createPreparedSettlement, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement confirmation", { timeout: 60000 }, () => {
  it("confirms a prepared batch and all snapshot items", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { batch } = await createPreparedSettlement(app);
      const missingIdentity = await app.inject({ method: "POST", url: `/api/internal/settlement/batches/${batch.settlementBatchId}/confirm`, headers: { "x-xlb-city-code": "hangzhou" }, payload: {} });
      expect(missingIdentity.statusCode).toBe(401);
      const response = await confirmSettlementBatch(app, batch.settlementBatchId);
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ ok: true, idempotent: false, batch: { settlementBatchId: batch.settlementBatchId, cityCode: "hangzhou", status: "confirmed", confirmedBy: "operator-hangzhou" } });
      expect(response.json().batch.confirmedAt).toBeTruthy();
      const [items] = await getMysqlPool().query<(RowDataPacket & { status: string })[]>("SELECT status FROM settlement_items WHERE settlement_batch_id = ?", [batch.settlementBatchId]);
      expect(items).toHaveLength(batch.itemCount);
      expect(items.every((item) => item.status === "confirmed")).toBe(true);
    } finally { await app.close(); }
  }));
});
