import type {
  DashboardAttentionItem,
  DashboardCityHealth,
  DashboardRealtimeSnapshot,
  DashboardSourceState,
  RequestContext,
} from "@xlb/types";
import {
  dashboardRepository,
  type DashboardAggregateRows,
  type DashboardRepository,
} from "./dashboardRepository.js";

export class DashboardServiceError extends Error {
  constructor(message: string, readonly statusCode: 400 | 403 | 503) {
    super(message);
  }
}

function assertReadAccess(context: RequestContext): void {
  if (
    context.appType !== "dashboard" ||
    !["admin", "operator", "auditor"].includes(context.role)
  ) {
    throw new DashboardServiceError("Dashboard read identity required", 403);
  }
}

function cityState(city: DashboardAggregateRows["cities"][number]): DashboardCityHealth["state"] {
  if (
    city.ordersToday === 0 &&
    city.overdueCount === 0 &&
    city.urgentComplaintCount === 0 &&
    city.supportQueueCount === 0
  ) return "no_data";
  if (city.urgentComplaintCount > 0 || city.overdueCount >= 10) return "critical";
  if (city.overdueCount > 0 || city.supportQueueCount >= 5) return "warning";
  return "healthy";
}

function attentionItems(
  rows: DashboardAggregateRows,
  scopeLabel: string,
): DashboardAttentionItem[] {
  const hottestCity = rows.cities[0]?.cityName ?? scopeLabel;
  const items: DashboardAttentionItem[] = [];
  if (rows.aftersale.urgentOrCritical > 0) {
    items.push({
      id: "aftersale-urgent",
      severity: "critical",
      title: "紧急投诉待处置",
      cityLabel: hottestCity,
      count: rows.aftersale.urgentOrCritical,
      ageSeconds: rows.aftersale.oldestUrgentSeconds,
      detail: "紧急或重大投诉仍处于未关闭状态",
      owner: "售后运营",
    });
  }
  if (rows.support.slaBreached > 0) {
    items.push({
      id: "support-sla",
      severity: "critical",
      title: "客服 SLA 已超时",
      cityLabel: hottestCity,
      count: rows.support.slaBreached,
      ageSeconds: rows.support.oldestWaitSeconds,
      detail: "存在首响或解决时限已超时的工单",
      owner: "客服中心",
    });
  }
  if (
    rows.fulfillment.longestPendingSeconds !== null &&
    rows.fulfillment.longestPendingSeconds >= 3_600
  ) {
    items.push({
      id: "dispatch-wait",
      severity: "warning",
      title: "派单等待超过 60 分钟",
      cityLabel: hottestCity,
      count: rows.fulfillment.pendingDispatch,
      ageSeconds: rows.fulfillment.longestPendingSeconds,
      detail: "待派、重派或人工复核任务需要调度关注",
      owner: "调度中心",
    });
  }
  const paymentFailureRate = rows.payments.totalToday > 0
    ? rows.payments.failedToday / rows.payments.totalToday
    : 0;
  if (paymentFailureRate >= 0.05) {
    items.push({
      id: "payment-failure",
      severity: paymentFailureRate >= 0.1 ? "critical" : "warning",
      title: "支付失败率上升",
      cityLabel: scopeLabel,
      count: rows.payments.failedToday,
      ageSeconds: null,
      detail: `今日支付失败率 ${(paymentFailureRate * 100).toFixed(1)}%`,
      owner: "支付风控",
    });
  }
  if (items.length === 0) {
    items.push({
      id: "all-clear",
      severity: "info",
      title: "当前无高优先级异常",
      cityLabel: scopeLabel,
      count: 0,
      ageSeconds: null,
      detail: "交易、履约、售后和客服指标均未触发处置阈值",
      owner: "值班运营",
    });
  }
  return items.slice(0, 4);
}

function sourceStates(observedAt: string): DashboardSourceState[] {
  return [
    ["orders", "Orders 订单"],
    ["payments", "Payments 支付"],
    ["dispatch", "Dispatch 派单"],
    ["fulfillment", "Fulfillment 履约"],
    ["aftersale", "Aftersale 售后"],
    ["support", "Support 客服"],
  ].map(([source, label]) => ({
    source: source as DashboardSourceState["source"],
    label,
    state: "live",
    observedAt,
    lagSeconds: 0,
  }));
}

export class DashboardService {
  constructor(private readonly repository: DashboardRepository = dashboardRepository) {}

  async realtime(
    context: RequestContext,
    cityCode?: string,
  ): Promise<DashboardRealtimeSnapshot> {
    assertReadAccess(context);
    let rows: DashboardAggregateRows;
    try {
      rows = await this.repository.read(cityCode);
    } catch {
      throw new DashboardServiceError("Dashboard aggregate source is unavailable", 503);
    }

    const generatedAt = new Date().toISOString();
    const observedAt = rows.observedAt.toISOString();
    const scopeLabel = cityCode
      ? rows.cities[0]?.cityName ?? cityCode
      : "全国";
    const paymentSuccessRate = rows.payments.totalToday > 0
      ? Number(((rows.payments.paidToday / rows.payments.totalToday) * 100).toFixed(2))
      : null;

    return {
      contractVersion: "1",
      scope: cityCode
        ? { kind: "city", cityCode, label: scopeLabel }
        : { kind: "all", label: "全国" },
      generatedAt,
      observedAt,
      refreshAfterSeconds: 15,
      staleAfterSeconds: 45,
      disconnectedAfterSeconds: 120,
      privacy: {
        containsPersonalData: false,
        exactWorkerLocationIncluded: false,
        messageContentIncluded: false,
      },
      headline: {
        ordersToday: rows.orders.today,
        paidAmountToday: rows.payments.paidAmountToday,
        paymentSuccessRate,
        fulfillmentActive: rows.fulfillment.serviceActive,
        dispatchPending: rows.fulfillment.pendingDispatch,
        completedToday: rows.fulfillment.completedToday,
      },
      pulse: rows.pulse.map((point) => ({
        ...point,
        bucketStart: point.bucketStart.toISOString(),
      })),
      fulfillment: rows.fulfillment,
      aftersale: {
        untriaged: rows.aftersale.untriaged,
        active: rows.aftersale.active,
        urgentOrCritical: rows.aftersale.urgentOrCritical,
        pendingRepair: rows.aftersale.pendingRepair,
      },
      support: rows.support,
      attention: attentionItems(rows, scopeLabel),
      cities: rows.cities.map((city) => ({
        ...city,
        state: cityState(city),
      })),
      sources: sourceStates(observedAt),
    };
  }
}

export const dashboardService = new DashboardService();
