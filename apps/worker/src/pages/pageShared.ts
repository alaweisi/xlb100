import type { CSSProperties } from "react";

export const workerPanelStyle: CSSProperties = {
  background: "rgba(47, 75, 110, 0.86)",
  borderColor: "rgba(138, 174, 210, 0.24)",
  borderRadius: 8,
  boxShadow: "none",
  color: "#f8fbff",
};

export const helperText: CSSProperties = {
  color: "#b7c9dc",
  fontSize: 13,
  lineHeight: "20px",
  margin: 0,
};

export const mutedBoxStyle: CSSProperties = {
  background: "rgba(255, 255, 255, 0.08)",
  border: "1px solid rgba(138, 174, 210, 0.18)",
  borderRadius: 8,
  display: "grid",
  gap: 8,
  padding: 12,
};

export function formatAmount(amount: number): string {
  return `¥${amount.toFixed(2)}`;
}

export function formatBusinessCode(value: string | null | undefined, label: string): string {
  if (!value) return `${label}·暂无`;
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.charCodeAt(0), 16777619) >>> 0;
  }
  return `${label}·${String(hash % 1_000_000).padStart(6, "0")}`;
}

export function formatCityName(cityCode: string): string {
  const labels: Record<string, string> = { hangzhou: "杭州", shanghai: "上海", beijing: "北京" };
  return labels[cityCode] ?? formatBusinessCode(cityCode, "城市");
}

export function formatServiceName(serviceCode: string): string {
  const labels: Record<string, string> = {
    home_service_basic: "基础上门服务",
    sku_home_service_basic: "基础上门服务",
  };
  return labels[serviceCode] ?? formatBusinessCode(serviceCode, "服务");
}

export function uiStateIs(value: string | null | undefined, expected: string): boolean {
  return value === expected;
}

export function uiStateIn(value: string | null | undefined, expected: readonly string[]): boolean {
  return expected.includes(value ?? "");
}

export function uiChoice<T>(condition: boolean, whenTrue: T, whenFalse: T): T {
  return condition ? whenTrue : whenFalse;
}

export function statusTone(status: string): "primary" | "success" | "warning" | "danger" | "muted" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "primary";
  if (status === "accepted" || status === "queued" || status === "offering" || status === "reassigning") return "warning";
  if (status === "cancelled" || status === "failed" || status === "no_match" || status === "manual_review") return "danger";
  return "muted";
}

export function formatNullable(value: string | null | undefined): string {
  return value || "-";
}

const dispatchStatusLabels: Record<string, string> = {
  pending: "待进入派单",
  queued: "排队中",
  offering: "派单邀约待响应",
  accepted: "已承接",
  expired: "已过期",
  reassigning: "重新派单中",
  completed: "已完成",
  rejected: "已放弃",
  timeout: "响应超时",
  no_match: "暂无匹配",
  manual_review: "人工处理中",
  failed: "派单失败",
  cancelled: "已取消",
};

const fulfillmentStatusLabels: Record<string, string> = {
  accepted: "待开始",
  in_progress: "服务中",
  completed: "已完工",
  cancelled: "已取消",
};

export function dispatchStatusLabel(status: string): string {
  return dispatchStatusLabels[status] ?? "未知状态";
}

export function fulfillmentStatusLabel(status: string): string {
  return fulfillmentStatusLabels[status] ?? "未知状态";
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "暂无";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
