import type { RowDataPacket } from "mysql2/promise";
import type {
  DashboardCityOperations,
  DashboardOperationsSnapshot,
  DashboardOperationsTotals,
} from "@xlb/types";
import { getMysqlPool } from "../dal/mysqlPool.js";

type AggregateRow = RowDataPacket & {
  city_code: string;
  today_orders?: number | string;
  active_orders?: number | string;
  completed_today?: number | string;
  pending_dispatch?: number | string;
  open_support_tickets?: number | string;
  open_aftersale_complaints?: number | string;
};

const emptyTotals = (): DashboardOperationsTotals => ({
  todayOrders: 0,
  activeOrders: 0,
  completedToday: 0,
  pendingDispatch: 0,
  openSupportTickets: 0,
  openAftersaleComplaints: 0,
});

function count(value: number | string | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function cityRecord(records: Map<string, DashboardCityOperations>, cityCode: string): DashboardCityOperations {
  const existing = records.get(cityCode);
  if (existing) return existing;
  const created = { cityCode, ...emptyTotals() };
  records.set(cityCode, created);
  return created;
}

export async function readDashboardOperations(): Promise<DashboardOperationsSnapshot> {
  const pool = getMysqlPool();
  const [orders, dispatch, support, aftersale] = await Promise.all([
    pool.query<AggregateRow[]>(
      `SELECT city_code,
        SUM(created_at >= CURRENT_DATE) AS today_orders,
        SUM(status NOT IN ('paid', 'cancelled')) AS active_orders,
        SUM(status IN ('service_completed', 'paid') AND updated_at >= CURRENT_DATE) AS completed_today
       FROM orders GROUP BY city_code ORDER BY city_code`,
    ),
    pool.query<AggregateRow[]>(
      `SELECT city_code,
        SUM(status IN ('pending', 'queued', 'offering', 'reassigning', 'manual_review')) AS pending_dispatch
       FROM dispatch_tasks GROUP BY city_code ORDER BY city_code`,
    ),
    pool.query<AggregateRow[]>(
      `SELECT city_code,
        SUM(status NOT IN ('resolved', 'closed')) AS open_support_tickets
       FROM support_tickets GROUP BY city_code ORDER BY city_code`,
    ),
    pool.query<AggregateRow[]>(
      `SELECT city_code,
        SUM(status NOT IN ('resolved', 'closed', 'rejected')) AS open_aftersale_complaints
       FROM aftersale_complaints GROUP BY city_code ORDER BY city_code`,
    ),
  ]);

  const cities = new Map<string, DashboardCityOperations>();
  for (const row of orders[0]) {
    const item = cityRecord(cities, row.city_code);
    item.todayOrders = count(row.today_orders);
    item.activeOrders = count(row.active_orders);
    item.completedToday = count(row.completed_today);
  }
  for (const row of dispatch[0]) cityRecord(cities, row.city_code).pendingDispatch = count(row.pending_dispatch);
  for (const row of support[0]) cityRecord(cities, row.city_code).openSupportTickets = count(row.open_support_tickets);
  for (const row of aftersale[0]) cityRecord(cities, row.city_code).openAftersaleComplaints = count(row.open_aftersale_complaints);

  const cityValues = [...cities.values()].sort((left, right) => left.cityCode.localeCompare(right.cityCode));
  const totals = cityValues.reduce<DashboardOperationsTotals>((sum, item) => ({
    todayOrders: sum.todayOrders + item.todayOrders,
    activeOrders: sum.activeOrders + item.activeOrders,
    completedToday: sum.completedToday + item.completedToday,
    pendingDispatch: sum.pendingDispatch + item.pendingDispatch,
    openSupportTickets: sum.openSupportTickets + item.openSupportTickets,
    openAftersaleComplaints: sum.openAftersaleComplaints + item.openAftersaleComplaints,
  }), emptyTotals());

  return {
    generatedAt: new Date().toISOString(),
    source: "mysql-readonly-aggregate",
    refreshAfterSeconds: 15,
    totals,
    cities: cityValues,
  };
}
