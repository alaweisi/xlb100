export interface DashboardOperationsTotals {
  todayOrders: number;
  activeOrders: number;
  completedToday: number;
  pendingDispatch: number;
  openSupportTickets: number;
  openAftersaleComplaints: number;
}

export interface DashboardCityOperations extends DashboardOperationsTotals {
  cityCode: string;
}

export interface DashboardOperationsSnapshot {
  generatedAt: string;
  source: "mysql-readonly-aggregate";
  refreshAfterSeconds: number;
  totals: DashboardOperationsTotals;
  cities: DashboardCityOperations[];
}

export interface DashboardOperationsResponse {
  ok: true;
  snapshot: DashboardOperationsSnapshot;
}
