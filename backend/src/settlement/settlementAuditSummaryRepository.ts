import type { Pool, RowDataPacket } from "mysql2/promise";
import type { CityCode, RequestContext } from "@xlb/types";
import type {
  SettlementAuditSummaryQuery,
  SettlementAuditCounts,
  SettlementAuditStatusCounts,
  SettlementAuditAmounts,
  SettlementAuditBatchGroup,
} from "@xlb/types";
import { RepositoryBase } from "../dal/repositoryBase.js";
import { assertCityScopedContext } from "../dal/scopedExecutor.js";

type CountsRow = RowDataPacket & {
  totalBatches: number;
  totalItems: number;
  totalPayables: number;
  totalQueueItems: number;
};

type StatusRow = RowDataPacket & {
  status: string;
  count: number;
};

type AmountRow = RowDataPacket & {
  items_gross: string;
  items_fee: string;
  items_receivable: string;
  payable_gross: string;
  payable_fee: string;
  payable_receivable: string;
  queue_gross: string;
  queue_fee: string;
  queue_receivable: string;
};

type BatchGroupRow = RowDataPacket & {
  settlement_batch_id: string;
  status: string;
  item_count: number;
  payable_count: number;
  queue_count: number;
};

export class SettlementAuditSummaryRepository extends RepositoryBase {
  constructor(pool?: Pool) {
    super(pool);
  }

  async getAuditSummary(
    context: RequestContext,
    query: SettlementAuditSummaryQuery,
  ): Promise<{
    counts: SettlementAuditCounts;
    statusBreakdown: SettlementAuditStatusCounts[];
    amounts: SettlementAuditAmounts;
    groups: SettlementAuditBatchGroup[] | null;
  }> {
    assertCityScopedContext(context);
    const cityCode = context.cityCode! as CityCode;
    const conditions: string[] = ["b.city_code = ?"];
    const params: unknown[] = [cityCode];

    if (query.dateFrom) { conditions.push("b.prepared_at >= ?"); params.push(query.dateFrom); }
    if (query.dateTo) { conditions.push("b.prepared_at <= ?"); params.push(query.dateTo); }
    if (query.status) { conditions.push("b.status = ?"); params.push(query.status); }

    const where = conditions.join(" AND ");
    const batchCondition = conditions.join(" AND ");

    // Counts
    const [countRows] = await this.pool.query<CountsRow[]>(
      `SELECT COUNT(DISTINCT b.settlement_batch_id) AS totalBatches,
              COUNT(DISTINCT i.settlement_item_id) AS totalItems,
              COUNT(DISTINCT p.settlement_payable_id) AS totalPayables,
              COUNT(DISTINCT q.queue_id) AS totalQueueItems
       FROM settlement_batches b
       LEFT JOIN settlement_items i ON b.settlement_batch_id = i.settlement_batch_id AND b.city_code = i.city_code
       LEFT JOIN settlement_payables p ON b.settlement_batch_id = p.settlement_batch_id AND b.city_code = p.city_code
       LEFT JOIN settlement_payable_queue q ON p.settlement_payable_id = q.settlement_payable_id AND p.city_code = q.city_code
       WHERE ${where}`,
      params,
    );

    // Status breakdown
    const [statusRows] = await this.pool.query<StatusRow[]>(
      `SELECT b.status, COUNT(*) AS count
       FROM settlement_batches b
       WHERE ${where}
       GROUP BY b.status`,
      params,
    );

    // Amounts
    const [amtRows] = await this.pool.query<AmountRow[]>(
      `SELECT COALESCE(SUM(i.gross_amount), 0) AS items_gross,
              COALESCE(SUM(i.platform_fee), 0) AS items_fee,
              COALESCE(SUM(i.worker_receivable), 0) AS items_receivable,
              COALESCE(SUM(p.gross_amount), 0) AS payable_gross,
              COALESCE(SUM(p.platform_fee_amount), 0) AS payable_fee,
              COALESCE(SUM(p.worker_receivable_amount), 0) AS payable_receivable,
              COALESCE(SUM(q.gross_amount), 0) AS queue_gross,
              COALESCE(SUM(q.platform_fee_amount), 0) AS queue_fee,
              COALESCE(SUM(q.worker_receivable_amount), 0) AS queue_receivable
       FROM settlement_batches b
       LEFT JOIN settlement_items i ON b.settlement_batch_id = i.settlement_batch_id AND b.city_code = i.city_code
       LEFT JOIN settlement_payables p ON b.settlement_batch_id = p.settlement_batch_id AND b.city_code = p.city_code
       LEFT JOIN settlement_payable_queue q ON p.settlement_payable_id = q.settlement_payable_id AND p.city_code = q.city_code
       WHERE ${where}`,
      params,
    );

    const amounts: SettlementAuditAmounts = {
      itemsGrossAmount: Number(amtRows[0].items_gross),
      itemsPlatformFee: Number(amtRows[0].items_fee),
      itemsWorkerReceivable: Number(amtRows[0].items_receivable),
      payableGrossAmount: Number(amtRows[0].payable_gross),
      payablePlatformFee: Number(amtRows[0].payable_fee),
      payableWorkerReceivable: Number(amtRows[0].payable_receivable),
      queueGrossAmount: Number(amtRows[0].queue_gross),
      queuePlatformFee: Number(amtRows[0].queue_fee),
      queueWorkerReceivable: Number(amtRows[0].queue_receivable),
    };

    // Groups (by batch)
    let groups: SettlementAuditBatchGroup[] | null = null;
    if (query.groupBy === "batch") {
      const [groupRows] = await this.pool.query<BatchGroupRow[]>(
        `SELECT b.settlement_batch_id, b.status,
                COUNT(DISTINCT i.settlement_item_id) AS item_count,
                COUNT(DISTINCT p.settlement_payable_id) AS payable_count,
                COUNT(DISTINCT q.queue_id) AS queue_count
         FROM settlement_batches b
         LEFT JOIN settlement_items i ON b.settlement_batch_id = i.settlement_batch_id AND b.city_code = i.city_code
         LEFT JOIN settlement_payables p ON b.settlement_batch_id = p.settlement_batch_id AND b.city_code = p.city_code
         LEFT JOIN settlement_payable_queue q ON p.settlement_payable_id = q.settlement_payable_id AND p.city_code = q.city_code
         WHERE ${batchCondition}
         GROUP BY b.settlement_batch_id, b.status
         ORDER BY b.prepared_at DESC`,
        params,
      );
      groups = groupRows.map((r) => ({
        settlementBatchId: r.settlement_batch_id,
        status: r.status as SettlementAuditBatchGroup["status"],
        itemCount: Number(r.item_count),
        payableCount: Number(r.payable_count),
        queueCount: Number(r.queue_count),
      }));
    }

    return {
      counts: {
        totalBatches: Number(countRows[0].totalBatches),
        totalItems: Number(countRows[0].totalItems),
        totalPayables: Number(countRows[0].totalPayables),
        totalQueueItems: Number(countRows[0].totalQueueItems),
      },
      statusBreakdown: statusRows.map((r) => ({ status: r.status, count: Number(r.count) })),
      amounts,
      groups,
    };
  }
}

export const settlementAuditSummaryRepository = new SettlementAuditSummaryRepository();
