import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  RequestContext,
  WorkerReceivableStatementExport,
  WorkerReceivableStatementExportFormat,
  WorkerReceivableStatementExportPayloadVersion,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type ExportRow = RowDataPacket & {
  export_id: string;
  city_code: string;
  statement_id: string;
  review_id: string;
  queue_id: string;
  settlement_payable_id: string;
  settlement_batch_id: string;
  worker_id: string;
  export_format: WorkerReceivableStatementExportFormat;
  payload_version: WorkerReceivableStatementExportPayloadVersion;
  content_hash: string;
  exported_at: Date;
  exported_by: string;
  created_at: Date;
  updated_at: Date;
};

const mapExport = (row: ExportRow): WorkerReceivableStatementExport => ({
  exportId: row.export_id,
  cityCode: row.city_code as CityCode,
  statementId: row.statement_id,
  reviewId: row.review_id,
  queueId: row.queue_id,
  settlementPayableId: row.settlement_payable_id,
  settlementBatchId: row.settlement_batch_id,
  workerId: row.worker_id,
  exportFormat: row.export_format,
  payloadVersion: row.payload_version,
  contentHash: row.content_hash,
  exportedAt: row.exported_at.toISOString(),
  exportedBy: row.exported_by,
  createdAt: row.created_at.toISOString(),
  updatedAt: row.updated_at.toISOString(),
});

export class WorkerReceivableStatementExportRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async lockStatementForExport(
    connection: PoolConnection,
    cityCode: CityCode,
    statementId: string,
  ): Promise<boolean> {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT statement_id FROM worker_receivable_statements
       WHERE city_code = ? AND statement_id = ?
       FOR UPDATE`,
      [cityCode, statementId],
    );
    return rows.length > 0;
  }

  async findExportByStatement(
    connection: PoolConnection,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatementExport | null> {
    const [rows] = await connection.query<ExportRow[]>(
      `SELECT * FROM worker_receivable_statement_exports
       WHERE city_code = ? AND statement_id = ?
       LIMIT 1`,
      [cityCode, statementId],
    );
    return rows[0] ? mapExport(rows[0]) : null;
  }

  async insertExport(
    connection: PoolConnection,
    exportRecord: WorkerReceivableStatementExport,
  ): Promise<void> {
    await connection.query(
      `INSERT INTO worker_receivable_statement_exports
        (export_id, city_code, statement_id, review_id, queue_id, settlement_payable_id,
         settlement_batch_id, worker_id, export_format, payload_version, content_hash,
         exported_at, exported_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        exportRecord.exportId,
        exportRecord.cityCode,
        exportRecord.statementId,
        exportRecord.reviewId,
        exportRecord.queueId,
        exportRecord.settlementPayableId,
        exportRecord.settlementBatchId,
        exportRecord.workerId,
        exportRecord.exportFormat,
        exportRecord.payloadVersion,
        exportRecord.contentHash,
        new Date(exportRecord.exportedAt),
        exportRecord.exportedBy,
      ],
    );
  }

  async getExportByStatement(
    context: RequestContext,
    cityCode: CityCode,
    statementId: string,
  ): Promise<WorkerReceivableStatementExport | null> {
    this.requireContext(context);
    if (assertCityScopedContext(context) !== cityCode) {
      throw new Error("city_code mismatch in worker receivable statement export query");
    }
    const where = buildCityScopedWhere(cityCode);
    const [rows] = await this.pool.query<ExportRow[]>(
      `SELECT * FROM worker_receivable_statement_exports
       WHERE ${where.clause} AND statement_id = ?
       LIMIT 1`,
      [...where.params, statementId],
    );
    return rows[0] ? mapExport(rows[0]) : null;
  }
}

export const workerReceivableStatementExportRepository = new WorkerReceivableStatementExportRepository();
