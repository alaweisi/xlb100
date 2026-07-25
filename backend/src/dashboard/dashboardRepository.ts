import type { Pool, PoolConnection, RowDataPacket } from "mysql2/promise";
import { getMysqlPool } from "../dal/mysqlPool.js";

type Numeric = number | string | bigint | null;

export interface DashboardAggregateRows {
  observedAt: Date;
  orders: {
    today: number;
  };
  payments: {
    paidAmountToday: string;
    paidToday: number;
    failedToday: number;
    totalToday: number;
  };
  fulfillment: {
    pendingDispatch: number;
    pendingAcceptance: number;
    serviceActive: number;
    completedToday: number;
    longestPendingSeconds: number | null;
  };
  aftersale: {
    untriaged: number;
    active: number;
    urgentOrCritical: number;
    pendingRepair: number;
    oldestUrgentSeconds: number | null;
  };
  support: {
    queueingConversations: number;
    onlineAgents: number;
    oldestWaitSeconds: number | null;
    resolvedToday: number;
    slaBreached: number;
  };
  pulse: Array<{
    bucketStart: Date;
    ordersCreated: number;
    paymentsPaid: number;
    fulfillmentsCompleted: number;
  }>;
  cities: Array<{
    cityCode: string;
    cityName: string;
    ordersToday: number;
    overdueCount: number;
    urgentComplaintCount: number;
    supportQueueCount: number;
  }>;
}

function toDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error("dashboard aggregate query returned an invalid timestamp");
  }
  return date;
}

function toNumber(value: Numeric): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function toNullableNumber(value: Numeric): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function scopeFilter(alias: string, cityCode?: string): {
  sql: string;
  params: string[];
} {
  return cityCode
    ? { sql: ` AND ${alias}.city_code = ?`, params: [cityCode] }
    : { sql: "", params: [] };
}

async function queryOne<T extends RowDataPacket>(
  connection: PoolConnection,
  sql: string,
  params: unknown[],
): Promise<T> {
  const [rows] = await connection.query<T[]>(sql, params);
  if (!rows[0]) throw new Error("dashboard aggregate query returned no row");
  return rows[0];
}

export class DashboardRepository {
  constructor(private readonly pool: Pool = getMysqlPool()) {}

  async read(cityCode?: string): Promise<DashboardAggregateRows> {
    const connection = await this.pool.getConnection();
    try {
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.query("START TRANSACTION READ ONLY");

      const orderScope = scopeFilter("o", cityCode);
      const paymentScope = scopeFilter("p", cityCode);
      const dispatchScope = scopeFilter("d", cityCode);
      const fulfillmentScope = scopeFilter("f", cityCode);
      const complaintScope = scopeFilter("c", cityCode);
      const repairScope = scopeFilter("r", cityCode);
      const ticketScope = scopeFilter("t", cityCode);
      const conversationScope = scopeFilter("sc", cityCode);
      const agentScope = scopeFilter("sa", cityCode);

      const observed = await queryOne<RowDataPacket & { observed_at: Date | string }>(
        connection,
        "SELECT CURRENT_TIMESTAMP(3) AS observed_at",
        [],
      );

      const orders = await queryOne<RowDataPacket & { orders_today: Numeric }>(
        connection,
        `SELECT COUNT(*) AS orders_today
           FROM orders o
          WHERE o.created_at >= CURRENT_DATE()
            AND o.created_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
            ${orderScope.sql}`,
        orderScope.params,
      );

      const payments = await queryOne<RowDataPacket & {
        paid_amount_today: string | null;
        paid_today: Numeric;
        failed_today: Numeric;
        total_today: Numeric;
      }>(
        connection,
        `SELECT
           COALESCE(SUM(CASE WHEN p.status = 'paid' THEN p.amount ELSE 0 END), 0) AS paid_amount_today,
           SUM(CASE WHEN p.status = 'paid' THEN 1 ELSE 0 END) AS paid_today,
           SUM(CASE WHEN p.status = 'failed' THEN 1 ELSE 0 END) AS failed_today,
           COUNT(*) AS total_today
         FROM payment_orders p
         WHERE p.created_at >= CURRENT_DATE()
           AND p.created_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
           ${paymentScope.sql}`,
        paymentScope.params,
      );

      const dispatch = await queryOne<RowDataPacket & {
        pending_dispatch: Numeric;
        pending_acceptance: Numeric;
        longest_pending_seconds: Numeric;
      }>(
        connection,
        `SELECT
           SUM(CASE WHEN d.status IN ('pending','queued','offering','expired','reassigning','timeout','no_match','manual_review') THEN 1 ELSE 0 END) AS pending_dispatch,
           SUM(CASE WHEN d.status IN ('queued','offering') THEN 1 ELSE 0 END) AS pending_acceptance,
           MAX(CASE WHEN d.status IN ('pending','queued','offering','expired','reassigning','timeout','no_match','manual_review')
             THEN TIMESTAMPDIFF(SECOND, d.created_at, CURRENT_TIMESTAMP()) ELSE NULL END) AS longest_pending_seconds
         FROM dispatch_tasks d
         WHERE 1 = 1 ${dispatchScope.sql}`,
        dispatchScope.params,
      );

      const fulfillment = await queryOne<RowDataPacket & {
        service_active: Numeric;
        completed_today: Numeric;
      }>(
        connection,
        `SELECT
           SUM(CASE WHEN f.status IN ('accepted','in_progress') THEN 1 ELSE 0 END) AS service_active,
           SUM(CASE WHEN f.status = 'completed'
                     AND f.completed_at >= CURRENT_DATE()
                     AND f.completed_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
                    THEN 1 ELSE 0 END) AS completed_today
         FROM fulfillments f
         WHERE 1 = 1 ${fulfillmentScope.sql}`,
        fulfillmentScope.params,
      );

      const complaints = await queryOne<RowDataPacket & {
        untriaged: Numeric;
        active_count: Numeric;
        urgent_or_critical: Numeric;
        oldest_urgent_seconds: Numeric;
      }>(
        connection,
        `SELECT
           SUM(CASE WHEN c.status = 'submitted' THEN 1 ELSE 0 END) AS untriaged,
           SUM(CASE WHEN c.status IN ('submitted','triaged','in_progress','waiting_customer') THEN 1 ELSE 0 END) AS active_count,
           SUM(CASE WHEN c.priority IN ('urgent','critical')
                     AND c.status IN ('submitted','triaged','in_progress','waiting_customer')
                    THEN 1 ELSE 0 END) AS urgent_or_critical,
           MAX(CASE WHEN c.priority IN ('urgent','critical')
                     AND c.status IN ('submitted','triaged','in_progress','waiting_customer')
                    THEN TIMESTAMPDIFF(SECOND, c.submitted_at, CURRENT_TIMESTAMP()) ELSE NULL END) AS oldest_urgent_seconds
         FROM aftersale_complaints c
         WHERE 1 = 1 ${complaintScope.sql}`,
        complaintScope.params,
      );

      const repairs = await queryOne<RowDataPacket & { pending_repair: Numeric }>(
        connection,
        `SELECT SUM(CASE WHEN r.status IN ('requested','assigned','in_progress') THEN 1 ELSE 0 END) AS pending_repair
           FROM aftersale_repair_orders r
          WHERE 1 = 1 ${repairScope.sql}`,
        repairScope.params,
      );

      const tickets = await queryOne<RowDataPacket & {
        resolved_today: Numeric;
        sla_breached: Numeric;
      }>(
        connection,
        `SELECT
           SUM(CASE WHEN t.status IN ('resolved','closed')
                     AND t.resolved_at >= CURRENT_DATE()
                     AND t.resolved_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
                    THEN 1 ELSE 0 END) AS resolved_today,
           SUM(CASE WHEN t.status NOT IN ('resolved','closed')
                     AND (t.sla_first_response_breached_at IS NOT NULL
                       OR t.sla_resolution_breached_at IS NOT NULL)
                    THEN 1 ELSE 0 END) AS sla_breached
         FROM support_tickets t
         WHERE 1 = 1 ${ticketScope.sql}`,
        ticketScope.params,
      );

      const conversations = await queryOne<RowDataPacket & {
        queueing_conversations: Numeric;
        oldest_wait_seconds: Numeric;
      }>(
        connection,
        `SELECT
           SUM(CASE WHEN sc.status = 'queueing' THEN 1 ELSE 0 END) AS queueing_conversations,
           MAX(CASE WHEN sc.status = 'queueing'
             THEN TIMESTAMPDIFF(SECOND, sc.started_at, CURRENT_TIMESTAMP()) ELSE NULL END) AS oldest_wait_seconds
         FROM support_conversations sc
         WHERE 1 = 1 ${conversationScope.sql}`,
        conversationScope.params,
      );

      const agents = await queryOne<RowDataPacket & { online_agents: Numeric }>(
        connection,
        `SELECT SUM(CASE WHEN sa.lifecycle_status = 'active'
                          AND sa.work_status IN ('online','busy')
                         THEN 1 ELSE 0 END) AS online_agents
           FROM support_agents sa
          WHERE 1 = 1 ${agentScope.sql}`,
        agentScope.params,
      );

      const pulseScopeParams = [
        ...orderScope.params,
        ...paymentScope.params,
        ...fulfillmentScope.params,
      ];
      const [pulseRows] = await connection.query<(RowDataPacket & {
        bucket_start: Date | string;
        orders_created: Numeric;
        payments_paid: Numeric;
        fulfillments_completed: Numeric;
      })[]>(
        `SELECT bucket_start,
                SUM(orders_created) AS orders_created,
                SUM(payments_paid) AS payments_paid,
                SUM(fulfillments_completed) AS fulfillments_completed
           FROM (
             SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(o.created_at) / 300) * 300) AS bucket_start,
                    COUNT(*) AS orders_created, 0 AS payments_paid, 0 AS fulfillments_completed
               FROM orders o
              WHERE o.created_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 MINUTE)
                ${orderScope.sql}
              GROUP BY bucket_start
             UNION ALL
             SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(p.updated_at) / 300) * 300) AS bucket_start,
                    0, COUNT(*), 0
               FROM payment_orders p
              WHERE p.status = 'paid'
                AND p.updated_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 MINUTE)
                ${paymentScope.sql}
              GROUP BY bucket_start
             UNION ALL
             SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(f.completed_at) / 300) * 300) AS bucket_start,
                    0, 0, COUNT(*)
               FROM fulfillments f
              WHERE f.status = 'completed'
                AND f.completed_at >= DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 MINUTE)
                ${fulfillmentScope.sql}
              GROUP BY bucket_start
           ) pulse
          GROUP BY bucket_start
          ORDER BY bucket_start ASC`,
        pulseScopeParams,
      );

      const cityParams = cityCode ? [cityCode] : [];
      const [cityRows] = await connection.query<(RowDataPacket & {
        city_code: string;
        city_name: string;
        orders_today: Numeric;
        overdue_count: Numeric;
        urgent_complaint_count: Numeric;
        support_queue_count: Numeric;
      })[]>(
        `SELECT c.city_code, c.city_name,
                COALESCE(o.orders_today, 0) AS orders_today,
                COALESCE(d.overdue_count, 0) + COALESCE(s.sla_breached, 0) AS overdue_count,
                COALESCE(a.urgent_complaint_count, 0) AS urgent_complaint_count,
                COALESCE(q.support_queue_count, 0) AS support_queue_count
           FROM cities c
           LEFT JOIN (
             SELECT city_code, COUNT(*) AS orders_today
               FROM orders
              WHERE created_at >= CURRENT_DATE()
                AND created_at < DATE_ADD(CURRENT_DATE(), INTERVAL 1 DAY)
              GROUP BY city_code
           ) o ON o.city_code = c.city_code
           LEFT JOIN (
             SELECT city_code, COUNT(*) AS overdue_count
               FROM dispatch_tasks
              WHERE status IN ('pending','queued','offering','expired','reassigning','timeout','no_match','manual_review')
                AND created_at < DATE_SUB(CURRENT_TIMESTAMP(), INTERVAL 60 MINUTE)
              GROUP BY city_code
           ) d ON d.city_code = c.city_code
           LEFT JOIN (
             SELECT city_code, COUNT(*) AS urgent_complaint_count
               FROM aftersale_complaints
              WHERE priority IN ('urgent','critical')
                AND status IN ('submitted','triaged','in_progress','waiting_customer')
              GROUP BY city_code
           ) a ON a.city_code = c.city_code
           LEFT JOIN (
             SELECT city_code, COUNT(*) AS sla_breached
               FROM support_tickets
              WHERE status NOT IN ('resolved','closed')
                AND (sla_first_response_breached_at IS NOT NULL
                  OR sla_resolution_breached_at IS NOT NULL)
              GROUP BY city_code
           ) s ON s.city_code = c.city_code
           LEFT JOIN (
             SELECT city_code, COUNT(*) AS support_queue_count
               FROM support_conversations
              WHERE status = 'queueing'
              GROUP BY city_code
           ) q ON q.city_code = c.city_code
          WHERE c.is_open = 1
            ${cityCode ? "AND c.city_code = ?" : ""}
          ORDER BY urgent_complaint_count DESC, overdue_count DESC, orders_today DESC, c.city_code ASC
          LIMIT 8`,
        cityParams,
      );

      await connection.commit();
      return {
        observedAt: toDate(observed.observed_at),
        orders: { today: toNumber(orders.orders_today) },
        payments: {
          paidAmountToday: String(payments.paid_amount_today ?? "0.00"),
          paidToday: toNumber(payments.paid_today),
          failedToday: toNumber(payments.failed_today),
          totalToday: toNumber(payments.total_today),
        },
        fulfillment: {
          pendingDispatch: toNumber(dispatch.pending_dispatch),
          pendingAcceptance: toNumber(dispatch.pending_acceptance),
          serviceActive: toNumber(fulfillment.service_active),
          completedToday: toNumber(fulfillment.completed_today),
          longestPendingSeconds: toNullableNumber(dispatch.longest_pending_seconds),
        },
        aftersale: {
          untriaged: toNumber(complaints.untriaged),
          active: toNumber(complaints.active_count),
          urgentOrCritical: toNumber(complaints.urgent_or_critical),
          pendingRepair: toNumber(repairs.pending_repair),
          oldestUrgentSeconds: toNullableNumber(complaints.oldest_urgent_seconds),
        },
        support: {
          queueingConversations: toNumber(conversations.queueing_conversations),
          onlineAgents: toNumber(agents.online_agents),
          oldestWaitSeconds: toNullableNumber(conversations.oldest_wait_seconds),
          resolvedToday: toNumber(tickets.resolved_today),
          slaBreached: toNumber(tickets.sla_breached),
        },
        pulse: pulseRows.map((row) => ({
          bucketStart: toDate(row.bucket_start),
          ordersCreated: toNumber(row.orders_created),
          paymentsPaid: toNumber(row.payments_paid),
          fulfillmentsCompleted: toNumber(row.fulfillments_completed),
        })),
        cities: cityRows.map((row) => ({
          cityCode: row.city_code,
          cityName: row.city_name,
          ordersToday: toNumber(row.orders_today),
          overdueCount: toNumber(row.overdue_count),
          urgentComplaintCount: toNumber(row.urgent_complaint_count),
          supportQueueCount: toNumber(row.support_queue_count),
        })),
      };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export const dashboardRepository = new DashboardRepository();
