import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./ledgerTestHelper.js";

export const settlementHeaders = (cityCode = "hangzhou") => ({
  "x-xlb-app-type": "admin",
  "x-xlb-role": "operator",
  "x-xlb-city-code": cityCode,
  "x-xlb-user-id": cityCode === "hangzhou" ? "operator-hangzhou" : "operator-shanghai",
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

export const confirmSettlementBatch = (app: FastifyInstance, batchId: string, cityCode = "hangzhou") =>
  app.inject({ method: "POST", url: `/api/internal/settlement/batches/${batchId}/confirm`, headers: settlementHeaders(cityCode), payload: {} });

export const markSettlementPayable = (app: FastifyInstance, batchId: string, cityCode = "hangzhou") =>
  app.inject({ method: "POST", url: `/api/internal/settlement/batches/${batchId}/mark-payable`, headers: settlementHeaders(cityCode), payload: {} });

export const getSettlementPayable = (app: FastifyInstance, batchId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/batches/${batchId}/payable`, headers: settlementHeaders(cityCode) });

export async function createConfirmedSettlement(app: FastifyInstance) {
  const prepared = await createPreparedSettlement(app);
  const confirm = await confirmSettlementBatch(app, prepared.batch.settlementBatchId);
  if (confirm.statusCode !== 200) throw new Error(`Failed to confirm settlement: ${confirm.body}`);
  return { ...prepared, batch: confirm.json().batch };
}

export async function createPayableSettlement(app: FastifyInstance) {
  const confirmed = await createConfirmedSettlement(app);
  const mark = await markSettlementPayable(app, confirmed.batch.settlementBatchId);
  if (mark.statusCode !== 200) throw new Error(`Failed to mark payable: ${mark.body}`);
  return { ...confirmed, payable: mark.json().payable as { settlementPayableId: string; grossAmount: number; platformFeeAmount: number; workerReceivableAmount: number; itemCount: number } };
}

export const enqueueSettlementPayable = (app: FastifyInstance, payableId: string, cityCode = "hangzhou") =>
  app.inject({ method: "POST", url: `/api/internal/settlement/payables/${payableId}/enqueue-once`, headers: settlementHeaders(cityCode), payload: {} });

export const getSettlementPayableQueue = (app: FastifyInstance, payableId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/payables/${payableId}/queue`, headers: settlementHeaders(cityCode) });

export const generateWorkerReceivableStatements = (app: FastifyInstance, payableId: string, cityCode = "hangzhou") =>
  app.inject({ method: "POST", url: `/api/internal/settlement/payables/${payableId}/generate-worker-statements-once`, headers: settlementHeaders(cityCode), payload: {} });

export const listWorkerReceivableStatements = (app: FastifyInstance, payableId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/payables/${payableId}/worker-statements`, headers: settlementHeaders(cityCode) });

export const getWorkerReceivableStatement = (app: FastifyInstance, statementId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/worker-statements/${statementId}`, headers: settlementHeaders(cityCode) });

export const reviewWorkerReceivableStatementOnce = (
  app: FastifyInstance,
  statementId: string,
  payload: { decision: "approved" | "rejected"; reviewNote?: string },
  cityCode = "hangzhou",
) =>
  app.inject({
    method: "POST",
    url: `/api/internal/settlement/worker-statements/${statementId}/review-once`,
    headers: settlementHeaders(cityCode),
    payload,
  });

export const getWorkerReceivableStatementReview = (app: FastifyInstance, statementId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/worker-statements/${statementId}/review`, headers: settlementHeaders(cityCode) });

export const exportWorkerReceivableStatementOnce = (app: FastifyInstance, statementId: string, cityCode = "hangzhou") =>
  app.inject({
    method: "POST",
    url: `/api/internal/settlement/worker-statements/${statementId}/export-once`,
    headers: settlementHeaders(cityCode),
    payload: {},
  });

export const getWorkerReceivableStatementExport = (app: FastifyInstance, statementId: string, cityCode = "hangzhou") =>
  app.inject({ method: "GET", url: `/api/internal/settlement/worker-statements/${statementId}/export`, headers: settlementHeaders(cityCode) });

export async function createApprovedStatementSettlement(app: FastifyInstance) {
  const ready = await createStatementReadySettlement(app);
  const review = await reviewWorkerReceivableStatementOnce(app, ready.statementId, { decision: "approved" });
  if (review.statusCode !== 200) throw new Error(`Failed to review statement: ${review.body}`);
  return { ...ready, review: review.json().review };
}

export async function createStatementReadySettlement(app: FastifyInstance) {
  const queued = await createQueuedSettlement(app);
  const generated = await generateWorkerReceivableStatements(app, queued.payable.settlementPayableId);
  if (generated.statusCode !== 200) throw new Error(`Failed to generate statements: ${generated.body}`);
  const statementId = generated.json().statements[0].statementId as string;
  return { ...queued, statementId, statements: generated.json().statements };
}

export async function createQueuedSettlement(app: FastifyInstance) {
  const payableSettlement = await createPayableSettlement(app);
  const enqueue = await enqueueSettlementPayable(app, payableSettlement.payable.settlementPayableId);
  if (enqueue.statusCode !== 200) throw new Error(`Failed to enqueue payable: ${enqueue.body}`);
  return { ...payableSettlement, queue: enqueue.json().queue as { queueId: string; status: string } };
}

export async function createPreparedSettlement(app: FastifyInstance) {
  const source = await createLedgerAccrual(app);
  const response = await prepareSettlementOnce(app);
  if (response.statusCode !== 200 || !response.json().batch) throw new Error(`Failed to prepare settlement: ${response.body}`);
  return { source, batch: response.json().batch as { settlementBatchId: string; totalGrossAmount: number; totalPlatformFee: number; totalWorkerReceivable: number; itemCount: number } };
}

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
