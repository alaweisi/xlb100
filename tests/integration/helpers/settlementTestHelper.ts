import type { FastifyInstance } from "fastify";
import type { RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../../../backend/src/dal/mysqlPool.js";
import { ensureHangzhouWorkerEligible } from "./acceptTestHelper.js";
import { createCompletedFulfillment, runLedgerOnce, withLedgerTestLock } from "./ledgerTestHelper.js";
import { assertResponseJson } from "./httpResponseTestHelper";
import { adminAuthHeaders } from "./authTestHelper.js";

export const settlementHeaders = (cityCode = "hangzhou") =>
  adminAuthHeaders(cityCode === "hangzhou" ? "operator-hangzhou" : "operator-shanghai", cityCode);

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
  const body = assertResponseJson<{ batch: { settlementBatchId: string; totalGrossAmount: number; totalPlatformFee: number; totalWorkerReceivable: number; itemCount: number } }>(
    confirm,
    `POST /api/internal/settlement/batches/${prepared.batch.settlementBatchId}/confirm`,
    [200],
  );
  return { ...prepared, batch: body.batch };
}

export async function createPayableSettlement(app: FastifyInstance) {
  const confirmed = await createConfirmedSettlement(app);
  const mark = await markSettlementPayable(app, confirmed.batch.settlementBatchId);
  const body = assertResponseJson<{
    payable: { settlementPayableId: string; grossAmount: number; platformFeeAmount: number; workerReceivableAmount: number; itemCount: number };
  }>(mark, `POST /api/internal/settlement/batches/${confirmed.batch.settlementBatchId}/mark-payable`, [200]);
  return { ...confirmed, payable: body.payable };
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
  const body = assertResponseJson<{ review: { reviewId: string; status: string } }>(
    review,
    `POST /api/internal/settlement/worker-statements/${ready.statementId}/review`,
    [200],
  );
  return { ...ready, review: body.review };
}

export async function createStatementReadySettlement(app: FastifyInstance) {
  const queued = await createQueuedSettlement(app);
  const generated = await generateWorkerReceivableStatements(app, queued.payable.settlementPayableId);
  const generatedBody = assertResponseJson<
    { statements: Array<{ statementId: string }> }
  >(generated, `POST /api/internal/settlement/payables/${queued.payable.settlementPayableId}/generate-worker-statements-once`, [200]);
  if (generatedBody.statements.length === 0) {
    throw new Error(`Failed to generate statements: ${generated.body}`);
  }
  return { ...queued, statementId: generatedBody.statements[0].statementId, statements: generatedBody.statements };
}

export async function createQueuedSettlement(app: FastifyInstance) {
  const payableSettlement = await createPayableSettlement(app);
  const enqueue = await enqueueSettlementPayable(app, payableSettlement.payable.settlementPayableId);
  const body = assertResponseJson<{ queue: { queueId: string; status: string } }>(
    enqueue,
    `POST /api/internal/settlement/payables/${payableSettlement.payable.settlementPayableId}/enqueue-once`,
    [200],
  );
  return { ...payableSettlement, queue: body.queue };
}

export async function createPreparedSettlement(app: FastifyInstance) {
  const source = await createLedgerAccrual(app);
  const response = await prepareSettlementOnce(app);
  const body = assertResponseJson<{
    batch: { settlementBatchId: string; totalGrossAmount: number; totalPlatformFee: number; totalWorkerReceivable: number; itemCount: number };
  }>(response, "POST /api/internal/settlement/prepare-once", [200]);
  if (!body.batch) throw new Error(`Failed to prepare settlement: ${response.body}`);
  return { source, batch: body.batch };
}

export async function withSettlementTestLock<T>(callback: () => Promise<T>): Promise<T> {
  const connection = await getMysqlPool().getConnection();
  try {
    const [rows] = await connection.query<(RowDataPacket & { acquired: number })[]>("SELECT GET_LOCK('xlb-phase8b-integration-tests', 300) AS acquired");
    if (rows[0]?.acquired !== 1) throw new Error("Could not acquire Phase 8B integration-test lock");
    return await callback();
  } finally {
    await connection.query("SELECT RELEASE_LOCK('xlb-phase8b-integration-tests')");
    connection.release();
  }
}
