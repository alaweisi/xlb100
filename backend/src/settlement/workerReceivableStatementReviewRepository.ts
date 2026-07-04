import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  RequestContext,
  WorkerReceivableStatement,
  WorkerReceivableStatementReview,
  WorkerReceivableStatementReviewDecision,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type ReviewRow = RowDataPacket & {
  review_id: string;
  city_code: string;
  statement_id: string;
  queue_id: string;
  settlement_payable_id: string;
  settlement_batch_id: string;
  worker_id: string;
  decision: WorkerReceivableStatementReviewDecision;
  review_note: string | null;
  reviewed_at: Date;
  reviewed_by: string;
  created_at: Date;
  updated_at: Date;
};

type StatementRow = RowDataPacket & {
  statement_id: string;
  city_code: string;
  queue_id: string;
  settlement_payable_id: string;
  settlement_batch_id: string;
  worker_id: string;
  status: WorkerReceivableStatement["status"];
};

const mapReview = (row: ReviewRow): WorkerReceivableStatementReview => ({
  reviewId: row.review_id,
  cityCode: row.city_code as CityCode,
  statementId: row.statement_id,
  queueId: row.queue_id,
  settlementPayableId: row.settlement_payable_id,
  settlementBatchId: row.settlement_batch_id,
  workerId: row.worker_id,
  decision: row.decision,
  reviewNote: row.review_note,
  reviewedAt: row.reviewed_at.toISOString(),
  reviewedBy: row.reviewed_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export class WorkerReceivableStatementReviewRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findStatementForReview(
    connection: PoolConnection,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatement | null> {
    const [rows] = await connection.query<StatementRow[]>(
      `SELECT statement_id, city_code, queue_id, settlement_payable_id, settlement_batch_id,
              worker_id, status
       FROM worker_receivable_statements
       WHERE city_code = ? AND statement_id = ?
       FOR UPDATE`,
      [cityCode, statementId],
    );
    const row = rows[0];
    if (!row) return null;
    return {
      statementId: row.statement_id,
      cityCode: row.city_code as CityCode,
      queueId: row.queue_id,
      settlementPayableId: row.settlement_payable_id,
      settlementBatchId: row.settlement_batch_id,
      workerId: row.worker_id,
      currency: "CNY",
      grossAmount: 0,
      platformFeeAmount: 0,
      workerReceivableAmount: 0,
      itemCount: 0,
      status: row.status,
      generatedAt: "",
      generatedBy: "",
      createdAt: "",
      updatedAt: "",
    };
  }

  async findReviewByStatement(
    connection: PoolConnection,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatementReview | null> {
    const [rows] = await connection.query<ReviewRow[]>(
      `SELECT * FROM worker_receivable_statement_reviews
       WHERE city_code = ? AND statement_id = ?
       LIMIT 1`,
      [cityCode, statementId],
    );
    return rows[0] ? mapReview(rows[0]) : null;
  }

  async insertReview(
    connection: PoolConnection,
    review: WorkerReceivableStatementReview,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO worker_receivable_statement_reviews
        (review_id, city_code, statement_id, queue_id, settlement_payable_id, settlement_batch_id,
         worker_id, decision, review_note, reviewed_at, reviewed_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        review.reviewId,
        review.cityCode,
        review.statementId,
        review.queueId,
        review.settlementPayableId,
        review.settlementBatchId,
        review.workerId,
        review.decision,
        review.reviewNote,
        new Date(review.reviewedAt),
        review.reviewedBy,
      ],
    );
  }

  async getReviewByStatement(
    context: RequestContext,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatementReview | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker receivable statement review query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<ReviewRow[]>(
      `SELECT * FROM worker_receivable_statement_reviews
       WHERE ${where.clause} AND statement_id = ?
       LIMIT 1`,
      [...where.params, statementId],
    );
    return rows[0] ? mapReview(rows[0]) : null;
  }
}

export const workerReceivableStatementReviewRepository = new WorkerReceivableStatementReviewRepository();
