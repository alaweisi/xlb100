import type { Pool, RowDataPacket } from "mysql2/promise";
import type {
  CityCode,
  RequestContext,
  StatementAuditQuery,
  StatementAuditItem,
  StatementAuditDetailResponse,
  ExportAuditQuery,
  ExportAuditItem,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import {
  assertCityScopedContext,
  buildCityScopedWhere,
} from "../dal/scopedExecutor.js";

type StatementAuditRow = RowDataPacket & {
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
  status: string;
  generated_at: Date;
  generated_by: string;
  review_id: string | null;
  review_decision: string | null;
  review_note: string | null;
  reviewed_at: Date | null;
  reviewed_by: string | null;
  export_id: string | null;
  export_format: string | null;
  export_payload_version: string | null;
  export_content_hash: string | null;
  exported_at: Date | null;
  exported_by: string | null;
  outbox_event_id: string | null;
};

type ExportAuditRow = RowDataPacket & {
  export_id: string;
  city_code: string;
  statement_id: string;
  review_id: string;
  worker_id: string;
  export_format: string;
  payload_version: string;
  content_hash: string;
  exported_at: Date;
  exported_by: string;
  outbox_event_id: string | null;
};

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

function buildAuditWhere(
  cityCode: CityCode,
  query: StatementAuditQuery,
  alias: string,
): { clause: string; params: unknown[] } {
  const conditions: string[] = [`${alias}.city_code = ?`];
  const params: unknown[] = [cityCode];

  if (query.workerId) {
    conditions.push(`${alias}.worker_id = ?`);
    params.push(query.workerId);
  }
  if (query.statementId) {
    conditions.push(`${alias}.statement_id = ?`);
    params.push(query.statementId);
  }
  if (query.statementCreatedFrom) {
    conditions.push(`${alias}.generated_at >= ?`);
    params.push(query.statementCreatedFrom);
  }
  if (query.statementCreatedTo) {
    conditions.push(`${alias}.generated_at <= ?`);
    params.push(query.statementCreatedTo);
  }

  return { clause: conditions.join(" AND "), params };
}

const mapAuditRow = (row: StatementAuditRow): StatementAuditItem => ({
  statementId: row.statement_id,
  cityCode: row.city_code as CityCode,
  workerId: row.worker_id,
  queueId: row.queue_id,
  settlementPayableId: row.settlement_payable_id,
  settlementBatchId: row.settlement_batch_id,
  currency: "CNY",
  grossAmount: Number(row.gross_amount),
  platformFeeAmount: Number(row.platform_fee_amount),
  workerReceivableAmount: Number(row.worker_receivable_amount),
  itemCount: row.item_count,
  status: "created",
  generatedAt: row.generated_at.toISOString(),
  generatedBy: row.generated_by,
  review: row.review_id
    ? {
        reviewId: row.review_id,
        decision: row.review_decision as "approved" | "rejected",
        reviewNote: row.review_note,
        reviewedAt: row.reviewed_at!.toISOString(),
        reviewedBy: row.reviewed_by!,
      }
    : null,
  export: row.export_id
    ? {
        exportId: row.export_id,
        exportFormat: row.export_format as "internal_v1",
        payloadVersion: row.export_payload_version as "v1",
        contentHash: row.export_content_hash!,
        exportedAt: row.exported_at!.toISOString(),
        exportedBy: row.exported_by!,
        outboxEventId: row.outbox_event_id,
      }
    : null,
});

const mapExportAuditRow = (row: ExportAuditRow): ExportAuditItem => ({
  exportId: row.export_id,
  cityCode: row.city_code as CityCode,
  statementId: row.statement_id,
  reviewId: row.review_id,
  workerId: row.worker_id,
  exportFormat: row.export_format as "internal_v1",
  payloadVersion: row.payload_version as "v1",
  contentHash: row.content_hash,
  exportedAt: row.exported_at.toISOString(),
  exportedBy: row.exported_by,
  outboxEventId: row.outbox_event_id,
});

export class WorkerReceivableStatementAuditRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async listStatementAudit(
    context: RequestContext,
    query: StatementAuditQuery,
  ): Promise<{ items: StatementAuditItem[]; nextCursor: string | null }> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const where = buildAuditWhere(cityCode, query, "s");
    const params: unknown[] = [...where.params];

    // cursor-based pagination: cursor is statement_id of the last item
    if (query.cursor) {
      where.clause += " AND s.statement_id < ?";
      params.push(query.cursor);
    }

    // review filter
    if (query.reviewDecision) {
      where.clause += " AND r.decision = ?";
      params.push(query.reviewDecision);
    }
    if (query.hasReview === true) {
      where.clause += " AND r.review_id IS NOT NULL";
    } else if (query.hasReview === false) {
      where.clause += " AND r.review_id IS NULL";
    }
    if (query.reviewedFrom) {
      where.clause += " AND r.reviewed_at >= ?";
      params.push(query.reviewedFrom);
    }
    if (query.reviewedTo) {
      where.clause += " AND r.reviewed_at <= ?";
      params.push(query.reviewedTo);
    }

    // export filter
    if (query.exportFormat) {
      where.clause += " AND e.export_format = ?";
      params.push(query.exportFormat);
    }
    if (query.hasExport === true) {
      where.clause += " AND e.export_id IS NOT NULL";
    } else if (query.hasExport === false) {
      where.clause += " AND e.export_id IS NULL";
    }
    if (query.exportedFrom) {
      where.clause += " AND e.exported_at >= ?";
      params.push(query.exportedFrom);
    }
    if (query.exportedTo) {
      where.clause += " AND e.exported_at <= ?";
      params.push(query.exportedTo);
    }

    params.push(limit + 1);

    const sql = `
      SELECT s.statement_id, s.city_code, s.queue_id, s.settlement_payable_id,
             s.settlement_batch_id, s.worker_id, s.currency,
             s.gross_amount, s.platform_fee_amount, s.worker_receivable_amount,
             s.item_count, s.status, s.generated_at, s.generated_by,
             r.review_id, r.decision AS review_decision, r.review_note,
             r.reviewed_at, r.reviewed_by,
             e.export_id, e.export_format, e.payload_version AS export_payload_version,
             e.content_hash AS export_content_hash, e.exported_at, e.exported_by,
             ev.event_id AS outbox_event_id
      FROM worker_receivable_statements s
      LEFT JOIN worker_receivable_statement_reviews r
        ON s.statement_id = r.statement_id AND s.city_code = r.city_code
      LEFT JOIN worker_receivable_statement_exports e
        ON s.statement_id = e.statement_id AND s.city_code = e.city_code
      LEFT JOIN event_outbox ev
        ON e.export_id = ev.aggregate_id
       AND ev.event_type = 'worker.receivable.statement.exported'
      WHERE ${where.clause}
      ORDER BY s.generated_at DESC, s.statement_id DESC
      LIMIT ?
    `;

    const [rows] = await this.pool.query<StatementAuditRow[]>(sql, params);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(mapAuditRow);
    const nextCursor = hasMore ? items[items.length - 1].statementId : null;

    return { items, nextCursor };
  }

  async getStatementAuditDetail(
    context: RequestContext,
    statementId: string,
  ): Promise<StatementAuditDetailResponse | null> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;

    const { clause, params } = buildCityScopedWhere(cityCode, "s.city_code");
    const sql = `
      SELECT s.statement_id, s.city_code, s.queue_id, s.settlement_payable_id,
             s.settlement_batch_id, s.worker_id, s.currency,
             s.gross_amount, s.platform_fee_amount, s.worker_receivable_amount,
             s.item_count, s.status, s.generated_at, s.generated_by,
             r.review_id, r.decision AS review_decision, r.review_note,
             r.reviewed_at, r.reviewed_by,
             e.export_id, e.export_format, e.payload_version AS export_payload_version,
             e.content_hash AS export_content_hash, e.exported_at, e.exported_by,
             ev.event_id AS outbox_event_id
      FROM worker_receivable_statements s
      LEFT JOIN worker_receivable_statement_reviews r
        ON s.statement_id = r.statement_id AND s.city_code = r.city_code
      LEFT JOIN worker_receivable_statement_exports e
        ON s.statement_id = e.statement_id AND s.city_code = e.city_code
      LEFT JOIN event_outbox ev
        ON e.export_id = ev.aggregate_id
       AND ev.event_type = 'worker.receivable.statement.exported'
      WHERE ${clause} AND s.statement_id = ?
      LIMIT 1
    `;
    params.push(statementId);

    const [rows] = await this.pool.query<StatementAuditRow[]>(sql, params);
    if (rows.length === 0) return null;

    const row = rows[0];
    return {
      statement: {
        statementId: row.statement_id,
        cityCode: row.city_code as CityCode,
        queueId: row.queue_id,
        settlementPayableId: row.settlement_payable_id,
        settlementBatchId: row.settlement_batch_id,
        workerId: row.worker_id,
        currency: "CNY",
        grossAmount: Number(row.gross_amount),
        platformFeeAmount: Number(row.platform_fee_amount),
        workerReceivableAmount: Number(row.worker_receivable_amount),
        itemCount: row.item_count,
        status: "created",
        generatedAt: row.generated_at.toISOString(),
        generatedBy: row.generated_by,
        createdAt: row.generated_at.toISOString(),
        updatedAt: row.generated_at.toISOString(),
      },
      review: row.review_id
        ? {
            reviewId: row.review_id,
            cityCode: row.city_code as CityCode,
            statementId: row.statement_id,
            queueId: row.queue_id,
            settlementPayableId: row.settlement_payable_id,
            settlementBatchId: row.settlement_batch_id,
            workerId: row.worker_id,
            decision: row.review_decision as "approved" | "rejected",
            reviewNote: row.review_note,
            reviewedAt: row.reviewed_at!.toISOString(),
            reviewedBy: row.reviewed_by!,
            createdAt: row.reviewed_at!.toISOString(),
            updatedAt: row.reviewed_at!.toISOString(),
          }
        : null,
      export: row.export_id
        ? {
            exportId: row.export_id,
            cityCode: row.city_code as CityCode,
            statementId: row.statement_id,
            reviewId: row.review_id!,
            queueId: row.queue_id,
            settlementPayableId: row.settlement_payable_id,
            settlementBatchId: row.settlement_batch_id,
            workerId: row.worker_id,
            exportFormat: row.export_format as "internal_v1",
            payloadVersion: row.export_payload_version as "v1",
            contentHash: row.export_content_hash!,
            exportedAt: row.exported_at!.toISOString(),
            exportedBy: row.exported_by!,
            createdAt: row.exported_at!.toISOString(),
            updatedAt: row.exported_at!.toISOString(),
          }
        : null,
      exportedOutboxEvent: row.outbox_event_id
        ? {
            eventId: row.outbox_event_id,
            eventType: "worker.receivable.statement.exported",
            status: "pending",
            publishedAt: null,
          }
        : null,
    };
  }

  async listExportAudit(
    context: RequestContext,
    query: ExportAuditQuery,
  ): Promise<{ items: ExportAuditItem[]; nextCursor: string | null }> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;
    const limit = Math.min(query.limit ?? DEFAULT_LIMIT, MAX_LIMIT);

    const conditions: string[] = ["e.city_code = ?"];
    const params: unknown[] = [cityCode];

    if (query.workerId) {
      conditions.push("e.worker_id = ?");
      params.push(query.workerId);
    }
    if (query.statementId) {
      conditions.push("e.statement_id = ?");
      params.push(query.statementId);
    }
    if (query.exportFormat) {
      conditions.push("e.export_format = ?");
      params.push(query.exportFormat);
    }
    if (query.contentHash) {
      conditions.push("e.content_hash = ?");
      params.push(query.contentHash);
    }
    if (query.exportedFrom) {
      conditions.push("e.exported_at >= ?");
      params.push(query.exportedFrom);
    }
    if (query.exportedTo) {
      conditions.push("e.exported_at <= ?");
      params.push(query.exportedTo);
    }
    if (query.cursor) {
      conditions.push("e.export_id < ?");
      params.push(query.cursor);
    }

    params.push(limit + 1);

    const where = conditions.join(" AND ");
    const sql = `
      SELECT e.export_id, e.city_code, e.statement_id, e.review_id, e.worker_id,
             e.export_format, e.payload_version, e.content_hash,
             e.exported_at, e.exported_by,
             ev.event_id AS outbox_event_id
      FROM worker_receivable_statement_exports e
      LEFT JOIN event_outbox ev
        ON e.export_id = ev.aggregate_id
       AND ev.event_type = 'worker.receivable.statement.exported'
      WHERE ${where}
      ORDER BY e.exported_at DESC, e.export_id DESC
      LIMIT ?
    `;

    const [rows] = await this.pool.query<ExportAuditRow[]>(sql, params);
    const hasMore = rows.length > limit;
    const items = (hasMore ? rows.slice(0, limit) : rows).map(mapExportAuditRow);
    const nextCursor = hasMore ? items[items.length - 1].exportId : null;

    return { items, nextCursor };
  }
}

export const workerReceivableStatementAuditRepository =
  new WorkerReceivableStatementAuditRepository();