import type { CityCode } from "./city.js";

export type DashboardFreshness = "live" | "stale" | "partial" | "disconnected";
export type DashboardSeverity = "critical" | "warning" | "info";
export type DashboardSource =
  | "orders"
  | "payments"
  | "dispatch"
  | "fulfillment"
  | "aftersale"
  | "support";

export interface DashboardScope {
  kind: "all" | "city";
  label: string;
  cityCode?: CityCode;
}

export interface DashboardSourceState {
  source: DashboardSource;
  label: string;
  state: DashboardFreshness;
  observedAt: string;
  lagSeconds: number;
}

export interface DashboardHeadline {
  ordersToday: number;
  paidAmountToday: string;
  paymentSuccessRate: number | null;
  fulfillmentActive: number;
  dispatchPending: number;
  completedToday: number;
}

export interface DashboardPulsePoint {
  bucketStart: string;
  ordersCreated: number;
  paymentsPaid: number;
  fulfillmentsCompleted: number;
}

export interface DashboardFulfillmentSummary {
  pendingDispatch: number;
  pendingAcceptance: number;
  serviceActive: number;
  completedToday: number;
  longestPendingSeconds: number | null;
}

export interface DashboardAftersaleSummary {
  untriaged: number;
  active: number;
  urgentOrCritical: number;
  pendingRepair: number;
}

export interface DashboardSupportSummary {
  queueingConversations: number;
  onlineAgents: number;
  oldestWaitSeconds: number | null;
  resolvedToday: number;
  slaBreached: number;
}

export interface DashboardCityHealth {
  cityCode: CityCode;
  cityName: string;
  ordersToday: number;
  overdueCount: number;
  urgentComplaintCount: number;
  supportQueueCount: number;
  state: "healthy" | "warning" | "critical" | "no_data";
}

export interface DashboardAttentionItem {
  id: string;
  severity: DashboardSeverity;
  title: string;
  cityLabel: string;
  count: number;
  ageSeconds: number | null;
  detail: string;
  owner: string;
}

export interface DashboardRealtimeSnapshot {
  contractVersion: "1";
  scope: DashboardScope;
  generatedAt: string;
  observedAt: string;
  refreshAfterSeconds: 15;
  staleAfterSeconds: 45;
  disconnectedAfterSeconds: 120;
  privacy: {
    containsPersonalData: false;
    exactWorkerLocationIncluded: false;
    messageContentIncluded: false;
  };
  headline: DashboardHeadline;
  pulse: DashboardPulsePoint[];
  fulfillment: DashboardFulfillmentSummary;
  aftersale: DashboardAftersaleSummary;
  support: DashboardSupportSummary;
  attention: DashboardAttentionItem[];
  cities: DashboardCityHealth[];
  sources: DashboardSourceState[];
}

export interface DashboardRealtimeResponse {
  ok: true;
  snapshot: DashboardRealtimeSnapshot;
}
