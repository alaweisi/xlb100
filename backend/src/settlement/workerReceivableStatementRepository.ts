import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  RequestContext,
  WorkerReceivableStatement,
  WorkerReceivableStatementLine,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type StatementRow = RowDataPacket & {
  statement_id: string;
  city_code: string;
  queue_id: string;
  settlement_payable_id: string;
  settlement_batch_id: string;
  worker_id: string;
  currency: "CNY";
  gross_amount: string;
  platform_fee_amount: string;
  worker_receivable_amount: string;
  item_count: number;
  status: WorkerReceivableStatement["status"];
  generated_at: Date;
  generated_by: string;
  created_at: Date;
  updated_at: Date;
};

type LineRow = RowDataPacket & {
  line_id: string;
  statement_id: string;
  city_code: string;
  settlement_item_id: string;
  settlement_batch_id: string;
  worker_id: string;
  order_id: string;
  fulfillment_id: string;
  sku_id: string;
  currency: "CNY";
  gross_amount: string;
  platform_fee_amount: string;
  worker_receivable_amount: string;
  created_at: Date;
};

const mapStatement = (row: StatementRow): WorkerReceivableStatement => ({
  statementId: row.statement_id,
  cityCode: row.city_code as CityCode,
  queueId: row.queue_id,
  settlementPayableId: row.settlement_payable_id,
  settlementBatchId: row.settlement_batch_id,
  workerId: row.worker_id,
  currency: row.currency,
  grossAmount: Number(row.gross_amount),
  platformFeeAmount: Number(row.platform_fee_amount),
  workerReceivableAmount: Number(row.worker_receivable_amount),
  itemCount: row.item_count,
  status: row.status,
  generatedAt: row.generated_at.toISOString(),
  generatedBy: row.generated_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

const mapLine = (row: LineRow): WorkerReceivableStatementLine => ({
  lineId: row.line_id,
  statementId: row.statement_id,
  cityCode: row.city_code as CityCode,
  settlementItemId: row.settlement_item_id,
  settlementBatchId: row.settlement_batch_id,
  workerId: row.worker_id,
  orderId: row.order_id,
  fulfillmentId: row.fulfillment_id,
  skuId: row.sku_id,
  currency: row.currency,
  grossAmount: Number(row.gross_amount),
  platformFeeAmount: Number(row.platform_fee_amount),
  workerReceivableAmount: Number(row.worker_receivable_amount),
  createdAt: row.created_at.toISOString(),
});

export class WorkerReceivableStatementRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async findStatementsByQueue(
    connection: PoolConnection,
    cityCode: CityCode,
    queueId: string,
  ): Promise<WorkerReceivableStatement[]> {
    const [rows] = await connection.query<StatementRow[]>(
      `SELECT * FROM worker_receivable_statements
       WHERE city_code = ? AND queue_id = ?
       ORDER BY worker_id ASC, statement_id ASC`,
      [cityCode, queueId],
    );
    return rows.map(mapStatement);
  }

  async insertStatement(
    connection: PoolConnection,
    statement: WorkerReceivableStatement,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO worker_receivable_statements
        (statement_id, city_code, queue_id, settlement_payable_id, settlement_batch_id,
         worker_id, currency, gross_amount, platform_fee_amount, worker_receivable_amount,
         item_count, status, generated_at, generated_by)
       VALUES (?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?, ?, 'created', ?, ?)`,
      [
        statement.statementId,
        statement.cityCode,
        statement.queueId,
        statement.settlementPayableId,
        statement.settlementBatchId,
        statement.workerId,
        statement.grossAmount,
        statement.platformFeeAmount,
        statement.workerReceivableAmount,
        statement.itemCount,
        new Date(statement.generatedAt),
        statement.generatedBy,
      ],
    );
  }

  async insertStatementLine(
    connection: PoolConnection,
    line: WorkerReceivableStatementLine,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO worker_receivable_statement_lines
        (line_id, statement_id, city_code, settlement_item_id, settlement_batch_id,
         worker_id, order_id, fulfillment_id, sku_id, currency,
         gross_amount, platform_fee_amount, worker_receivable_amount)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'CNY', ?, ?, ?)`,
      [
        line.lineId,
        line.statementId,
        line.cityCode,
        line.settlementItemId,
        line.settlementBatchId,
        line.workerId,
        line.orderId,
        line.fulfillmentId,
        line.skuId,
        line.grossAmount,
        line.platformFeeAmount,
        line.workerReceivableAmount,
      ],
    );
  }

  async listStatementsByPayable(
    context: RequestContext,
    cityCode: CityCode,
    payableId: string,
  ): Promise<WorkerReceivableStatement[] | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker receivable statement query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [payables] = await this.pool.query<RowDataPacket[]>(
      `SELECT settlement_payable_id FROM settlement_payables
       WHERE ${where.clause} AND settlement_payable_id = ? LIMIT 1`,
      [...where.params, payableId],
    );
    if (!payables[0]) return null;
    const [rows] = await this.pool.query<StatementRow[]>(
      `SELECT * FROM worker_receivable_statements
       WHERE ${where.clause} AND settlement_payable_id = ?
       ORDER BY worker_id ASC, statement_id ASC`,
      [...where.params, payableId],
    );
    return rows.map(mapStatement);
  }

  async getStatementById(
    context: RequestContext,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatement | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker receivable statement query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<StatementRow[]>(
      `SELECT * FROM worker_receivable_statements
       WHERE ${where.clause} AND statement_id = ? LIMIT 1`,
      [...where.params, statementId],
    );
    return rows[0] ? mapStatement(rows[0]) : null;
  }

  async listStatementLines(
    context: RequestContext,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatementLine[]> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker receivable statement query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<LineRow[]>(
      `SELECT * FROM worker_receivable_statement_lines
       WHERE ${where.clause} AND statement_id = ?
       ORDER BY created_at ASC, line_id ASC`,
      [...where.params, statementId],
    );
    return rows.map(mapLine);
  }
}

export const workerReceivableStatementRepository = new WorkerReceivableStatementRepository();
