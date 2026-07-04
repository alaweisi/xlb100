import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, RequestContext } from "@xlb/types";
import type { ReconciliationGapScanQuery, ReconciliationGapItem, ReconciliationGapScanSummary } from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";

type GapRow = RowDataPacket & { type: string; related_id: string; related_type: string; reason: string };

export class ReconciliationGapScanRepository extends RepositoryBase {
  constructor(pool?: Pool) { super(pool); }

  async scanGaps(context: RequestContext, query: ReconciliationGapScanQuery): Promise<{ summary: ReconciliationGapScanSummary; gaps: ReconciliationGapItem[] }> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;
    const gaps: ReconciliationGapItem[] = [];
    const now = new Date().toISOString();
    const dateFilter = (col: string) => {
      let c = "";
      const p: unknown[] = [];
      if (query.dateFrom) { c += ` AND ${col}.created_at >= ?`; p.push(query.dateFrom); }
      if (query.dateTo) { c += ` AND ${col}.created_at <= ?`; p.push(query.dateTo); }
      return { clause: c, params: p };
    };
    const gapType = query.gapType ?? "all";

    const addGap = (type: string, id: string, relType: string, reason: string) => {
      gaps.push({ type: type as ReconciliationGapItem["type"], cityCode, relatedId: id, relatedType: relType, severity: "warning", reason, detectedAt: now });
    };

    // batch-payable: confirmed batches without payable
    if (gapType === "all" || gapType === "batch-payable") {
      const df = dateFilter("b");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'batch-payable' AS type, b.settlement_batch_id AS related_id, 'settlement_batch' AS related_type, 'confirmed batch has no payable record' AS reason
         FROM settlement_batches b LEFT JOIN settlement_payables p ON b.settlement_batch_id = p.settlement_batch_id AND b.city_code = p.city_code
         WHERE b.city_code = ? AND b.status = 'confirmed' AND p.settlement_payable_id IS NULL${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    // payable-queue: payable rows not enqueued
    if (gapType === "all" || gapType === "payable-queue") {
      const df = dateFilter("p");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'payable-queue' AS type, p.settlement_payable_id AS related_id, 'settlement_payable' AS related_type, 'payable not enqueued' AS reason
         FROM settlement_payables p LEFT JOIN settlement_payable_queue q ON p.settlement_payable_id = q.settlement_payable_id AND p.city_code = q.city_code
         WHERE p.city_code = ? AND p.status = 'payable' AND q.queue_id IS NULL${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    // queue-statement: queued items without statement
    if (gapType === "all" || gapType === "queue-statement") {
      const df = dateFilter("q");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'queue-statement' AS type, q.queue_id AS related_id, 'settlement_payable_queue' AS related_type, 'queued item has no worker receivable statement' AS reason
         FROM settlement_payable_queue q LEFT JOIN worker_receivable_statements s ON q.queue_id = s.queue_id
         WHERE q.city_code = ? AND q.status = 'queued' AND s.statement_id IS NULL${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    // statement-review: created statements without review
    if (gapType === "all" || gapType === "statement-review") {
      const df = dateFilter("s");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'statement-review' AS type, s.statement_id AS related_id, 'worker_receivable_statement' AS related_type, 'statement pending review' AS reason
         FROM worker_receivable_statements s LEFT JOIN worker_receivable_statement_reviews r ON s.statement_id = r.statement_id
         WHERE s.city_code = ? AND s.status = 'created' AND r.review_id IS NULL${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    // review-export: approved reviews without export
    if (gapType === "all" || gapType === "review-export") {
      const df = dateFilter("r");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'review-export' AS type, r.statement_id AS related_id, 'worker_receivable_statement_review' AS related_type, 'approved review has no export' AS reason
         FROM worker_receivable_statement_reviews r LEFT JOIN worker_receivable_statement_exports e ON r.statement_id = e.statement_id
         WHERE r.city_code = ? AND r.decision = 'approved' AND e.export_id IS NULL${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    // export-integrity: exports with missing or empty content_hash
    if (gapType === "all" || gapType === "export-integrity") {
      const df = dateFilter("e");
      const [rows] = await this.pool.query<GapRow[]>(
        `SELECT 'export-integrity' AS type, e.export_id AS related_id, 'worker_receivable_statement_export' AS related_type, 'export missing content_hash' AS reason
         FROM worker_receivable_statement_exports e
         WHERE e.city_code = ? AND (e.content_hash IS NULL OR e.content_hash = '')${df.clause} LIMIT 200`,
        [cityCode, ...df.params],
      );
      rows.forEach((r) => addGap(r.type, r.related_id, r.related_type, r.reason));
    }

    const gapsByType: Record<string, number> = {};
    gaps.forEach((g) => { gapsByType[g.type] = (gapsByType[g.type] || 0) + 1; });

    return { summary: { totalGaps: gaps.length, gapsByType }, gaps };
  }
}

export const reconciliationGapScanRepository = new ReconciliationGapScanRepository();
