import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./ledgerTestHelper.js";

export const settlementHeaders = (cityCode = "hangzhou") => ({
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": cityCode,
});

export async function createLedgerAccrual(app: FastifyInstance) {
  return withLedgerTestLock(async () => {
    await ensureHangzhouWorkerEligible();
    const completed = await createCompletedFulfillment(app);
    const ledger = await runLedgerOnce(app);
    if (ledger.statusCode !== 200) throw new Error(`Failed to accrue ledger: ${ledger.body}`);
    const [rows] = await getMysqlPool().query<(RowDataPacket & { accrual_id: string })[]>(
      "SELECT accrual_id FROM ledger_accruals WHERE fulfillment_id = ? AND city_code = 'hangzhou' LIMIT 1",
      [completed.fulfillmentId],
    );
    return { ...completed, accrualId: rows[0]!.accrual_id };
  });
}

export const prepareSettlementOnce = (app: FastifyInstance, cityCode = "hangzhou") =>
  app.inject({ method: "POST", url: "/api/internal/settlement/prepare-once", headers: settlementHeaders(cityCode), payload: {} });

export async function withSettlementTestLock<T>(callback: () => Promise<T>): Promise<T> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.query<(RowDataPacket & { acquired: number })[]>("SELECT GET_LOCK('xlb-phase8b-integration-tests', 30) AS acquired");
    if (rows[0]?.acquired !== 1) throw new Error("Could not acquire Phase 8B integration-test lock");
    return await callback();
  } finally {
    await connection.query("SELECT RELEASE_LOCK('xlb-phase8b-integration-tests')");
    connection.release();
  }
}
