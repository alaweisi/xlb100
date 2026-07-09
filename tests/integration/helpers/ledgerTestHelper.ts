import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { workerHangzhouHeaders } from "./acceptTestHelper.js";
import { customerHeaders } from "./dispatchTestHelper.js";
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
  const confirmed = await app.inject({ method: "POST", url: `/api/orders/${accepted.orderId}/confirm-service`, headers: customerHeaders, payload: {} });
  if (confirmed.statusCode !== 200) throw new Error(`Failed to confirm service: ${confirmed.body}`);
  const payRes = await app.inject({ method: "POST", url: "/api/payments/orders", headers: customerHeaders, payload: { orderId: accepted.orderId } });
  if (payRes.statusCode !== 200) throw new Error(`Failed to create post-service payment order: ${payRes.body}`);
  const paymentOrderId = (payRes.json().paymentOrder as { paymentOrderId: string }).paymentOrderId;
  const paid = await app.inject({
    method: "POST",
    url: "/api/payments/mock-webhook",
    headers: customerHeaders,
    payload: { paymentOrderId, providerTradeNo: `mock-trade-ledger-${Date.now()}`, status: "paid" },
  });
  if (paid.statusCode !== 200) throw new Error(`Failed to mock pay after service: ${paid.body}`);
  return { fulfillmentId: accepted.fulfillmentId, orderId: accepted.orderId, paymentOrderId };
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
    try {
      await connection.query("SELECT RELEASE_LOCK('xlb-phase8a-integration-tests')");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("closed state")) {
        throw error;
      }
    } finally {
      connection.release();
    }
  }
}
