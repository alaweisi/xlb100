import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, RequestContext } from "@xlb/types";
import type {
  WorkerStatementReviewSummaryCounts,
  WorkerStatementReviewSummaryGroup,
  WorkerStatementReviewSummaryQuery,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";

type SummaryRow = RowDataPacket & {
  totalStatements: number;
  reviewedStatements: number;
  approvedStatements: number;
  rejectedStatements: number;
  pendingReviewStatements: number;
  exportedStatements: number;
  pendingExportStatements: number;
  noExportStatements: number;
  workerId: string | null;
};

const mapCounts = (r: SummaryRow): WorkerStatementReviewSummaryCounts => ({
  totalStatements: Number(r.totalStatements),
  reviewedStatements: Number(r.reviewedStatements),
  approvedStatements: Number(r.approvedStatements),
  rejectedStatements: Number(r.rejectedStatements),
  pendingReviewStatements: Number(r.pendingReviewStatements),
  exportedStatements: Number(r.exportedStatements),
  pendingExportStatements: Number(r.pendingExportStatements),
  noExportStatements: Number(r.noExportStatements),
});

export class WorkerReceivableStatementReviewSummaryRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async getReviewSummary(
    context: RequestContext,
    query: WorkerStatementReviewSummaryQuery,
  ): Promise<{
    overall: WorkerStatementReviewSummaryCounts;
    groups: WorkerStatementReviewSummaryGroup[] | null;
  }> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;
    const params: unknown[] = [cityCode];
    const conditions: string[] = ["s.city_code = ?"];

    if (query.dateFrom) {
      conditions.push("s.generated_at >= ?");
      params.push(query.dateFrom);
    }
    if (query.dateTo) {
      conditions.push("s.generated_at <= ?");
      params.push(query.dateTo);
    }

    const where = conditions.join(" AND ");

    if (query.groupBy === "worker") {
      const sql = `
        SELECT
          s.worker_id AS workerId,
          COUNT(*) AS totalStatements,
          SUM(CASE WHEN r.review_id IS NOT NULL THEN 1 ELSE 0 END) AS reviewedStatements,
          SUM(CASE WHEN r.decision = 'approved' THEN 1 ELSE 0 END) AS approvedStatements,
          SUM(CASE WHEN r.decision = 'rejected' THEN 1 ELSE 0 END) AS rejectedStatements,
          SUM(CASE WHEN r.review_id IS NULL THEN 1 ELSE 0 END) AS pendingReviewStatements,
          SUM(CASE WHEN e.export_id IS NOT NULL THEN 1 ELSE 0 END) AS exportedStatements,
          SUM(CASE WHEN r.decision = 'approved' AND e.export_id IS NULL THEN 1 ELSE 0 END) AS pendingExportStatements,
          SUM(CASE WHEN e.export_id IS NULL THEN 1 ELSE 0 END) AS noExportStatements
        FROM worker_receivable_statements s
        LEFT JOIN worker_receivable_statement_reviews r
          ON s.statement_id = r.statement_id AND s.city_code = r.city_code
        LEFT JOIN worker_receivable_statement_exports e
          ON s.statement_id = e.statement_id AND s.city_code = e.city_code
        WHERE ${where}
        GROUP BY s.worker_id
        ORDER BY s.worker_id
      `;
      const [rows] = await this.pool.query<SummaryRow[]>(sql, params);
      const groups: WorkerStatementReviewSummaryGroup[] = rows.map((r) => ({
        workerId: r.workerId!,
        counts: mapCounts(r),
      }));

      const overall = this.aggregateOverall(groups);
      return { overall, groups };
    }

    // groupBy = "none" or default
    const sql = `
      SELECT
        COUNT(*) AS totalStatements,
        SUM(CASE WHEN r.review_id IS NOT NULL THEN 1 ELSE 0 END) AS reviewedStatements,
        SUM(CASE WHEN r.decision = 'approved' THEN 1 ELSE 0 END) AS approvedStatements,
        SUM(CASE WHEN r.decision = 'rejected' THEN 1 ELSE 0 END) AS rejectedStatements,
        SUM(CASE WHEN r.review_id IS NULL THEN 1 ELSE 0 END) AS pendingReviewStatements,
        SUM(CASE WHEN e.export_id IS NOT NULL THEN 1 ELSE 0 END) AS exportedStatements,
        SUM(CASE WHEN r.decision = 'approved' AND e.export_id IS NULL THEN 1 ELSE 0 END) AS pendingExportStatements,
        SUM(CASE WHEN e.export_id IS NULL THEN 1 ELSE 0 END) AS noExportStatements,
        NULL AS workerId
      FROM worker_receivable_statements s
      LEFT JOIN worker_receivable_statement_reviews r
        ON s.statement_id = r.statement_id AND s.city_code = r.city_code
      LEFT JOIN worker_receivable_statement_exports e
        ON s.statement_id = e.statement_id AND s.city_code = e.city_code
      WHERE ${where}
    `;
    const [rows] = await this.pool.query<SummaryRow[]>(sql, params);
    return {
      overall: mapCounts(rows[0]),
      groups: null,
    };
  }

  private aggregateOverall(
    groups: WorkerStatementReviewSummaryGroup[],
  ): WorkerStatementReviewSummaryCounts {
    return {
      totalStatements: groups.reduce((s, g) => s + g.counts.totalStatements, 0),
      reviewedStatements: groups.reduce((s, g) => s + g.counts.reviewedStatements, 0),
      approvedStatements: groups.reduce((s, g) => s + g.counts.approvedStatements, 0),
      rejectedStatements: groups.reduce((s, g) => s + g.counts.rejectedStatements, 0),
      pendingReviewStatements: groups.reduce((s, g) => s + g.counts.pendingReviewStatements, 0),
      exportedStatements: groups.reduce((s, g) => s + g.counts.exportedStatements, 0),
      pendingExportStatements: groups.reduce((s, g) => s + g.counts.pendingExportStatements, 0),
      noExportStatements: groups.reduce((s, g) => s + g.counts.noExportStatements, 0),
    };
  }
}

export const workerReceivableStatementReviewSummaryRepository =
  new WorkerReceivableStatementReviewSummaryRepository();
