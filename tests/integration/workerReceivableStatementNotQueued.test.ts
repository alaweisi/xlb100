import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  createPayableSettlement,
  generateWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement not queued", { timeout: 60000 }, () => {
  it("rejects payable without queue", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable } = await createPayableSettlement(app);
      const response = await generateWorkerReceivableStatements(app, payable.settlementPayableId);
      expect(response.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
