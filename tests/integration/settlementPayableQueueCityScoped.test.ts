import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import { createPayableSettlement, enqueueSettlementPayable, getSettlementPayableQueue, settlementHeaders, withSettlementTestLock } from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("settlement payable queue city scope", { timeout: 60000 }, () => {
  it("does not enqueue or expose another city's queue", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable } = await createPayableSettlement(app);
      expect((await enqueueSettlementPayable(app, payable.settlementPayableId, "shanghai")).statusCode).toBe(404);
      await enqueueSettlementPayable(app, payable.settlementPayableId);
      expect((await getSettlementPayableQueue(app, payable.settlementPayableId, "shanghai")).statusCode).toBe(404);
      expect((await getSettlementPayableQueue(app, payable.settlementPayableId)).json().queue.status).toBe("queued");
    } finally { await app.close(); }
  }));
});
