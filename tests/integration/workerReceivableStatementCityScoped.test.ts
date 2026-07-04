import { describe, expect, it } from "vitest";
import { buildApp } from "../../backend/src/app.js";
import {
  createQueuedSettlement,
  generateWorkerReceivableStatements,
  getWorkerReceivableStatement,
  listWorkerReceivableStatements,
  withSettlementTestLock,
} from "./helpers/settlementTestHelper.js";

describe.skipIf(process.env.XLB_SKIP_DB_TESTS === "1")("worker receivable statement city scope", { timeout: 60000 }, () => {
  it("does not generate or expose another city's statements", () => withSettlementTestLock(async () => {
    const app = await buildApp();
    try {
      const { payable } = await createQueuedSettlement(app);
      const generate = await generateWorkerReceivableStatements(app, payable.settlementPayableId, "shanghai");
      expect(generate.statusCode).toBe(404);

      await generateWorkerReceivableStatements(app, payable.settlementPayableId);
      const list = await listWorkerReceivableStatements(app, payable.settlementPayableId, "shanghai");
      expect(list.statusCode).toBe(404);

      const hangzhouList = await listWorkerReceivableStatements(app, payable.settlementPayableId);
      const statementId = hangzhouList.json().statements[0].statementId as string;
      const detail = await getWorkerReceivableStatement(app, statementId, "shanghai");
      expect(detail.statusCode).toBe(404);
    } finally { await app.close(); }
  }));
});
