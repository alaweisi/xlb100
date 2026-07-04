import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { workerHangzhouHeaders } from "./acceptTestHelper.js";
import { createAcceptedFulfillment } from "./fulfillmentTestHelper.js";

export const ledgerOperatorHeaders = {
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": "hangzhou",
};

export async function createCompletedFulfillment(app: FastifyInstance): Promise<{
  fulfillmentId: string; orderId: string; paymentOrderId: string;
}> {
  const accepted = await createAcceptedFulfillment(app);
  const started = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${accepted.fulfillmentId}/start`, headers: workerHangzhouHeaders, payload: {} });
  if (started.statusCode !== 200) throw new Error(`Failed to start fulfillment: ${started.body}`);
  const completed = await app.inject({ method: "POST", url: `/api/worker/fulfillments/${accepted.fulfillmentId}/complete`, headers: workerHangzhouHeaders, payload: { completionNote: "Phase 8A ledger test" } });
  if (completed.statusCode !== 200) throw new Error(`Failed to complete fulfillment: ${completed.body}`);
  const [payments] = await getMysqlPool().query<(RowDataPacket & { payment_order_id: string })[]>("SELECT payment_order_id FROM payment_orders WHERE order_id = ? AND city_code = 'hangzhou' AND status = 'paid' LIMIT 1", [accepted.orderId]);
  return { fulfillmentId: accepted.fulfillmentId, orderId: accepted.orderId, paymentOrderId: payments[0]!.payment_order_id };
}

export async function runLedgerOnce(app: FastifyInstance) {
  return app.inject({ method: "POST", url: "/api/internal/ledger/run-once", headers: ledgerOperatorHeaders, payload: {} });
}

export async function withLedgerTestLock<T>(callback: () => Promise<T>): Promise<T> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.query<(RowDataPacket & { acquired: number })[]>("SELECT GET_LOCK('xlb-phase8a-integration-tests', 30) AS acquired");
    if (rows[0]?.acquired !== 1) throw new Error("Could not acquire Phase 8A integration-test lock");
    return await callback();
  } finally {
    await connection.query("SELECT RELEASE_LOCK('xlb-phase8a-integration-tests')");
    connection.release();
  }
}
