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
  return `CNY ${amount.toFixed(2)}`;
}

export function statusTone(status: string): "primary" | "success" | "warning" | "danger" | "muted" {
  if (status === "completed") return "success";
  if (status === "in_progress") return "primary";
  if (status === "accepted" || status === "queued" || status === "offering" || status === "reassigning") return "warning";
  if (status === "cancelled" || status === "failed" || status === "no_match" || status === "manual_review") return "danger";
  return "muted";
}

export function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    accepted: "已接单",
    assigned: "已分配",
    cancelled: "已取消",
    completed: "已完成",
    failed: "处理失败",
    in_progress: "服务中",
    manual_review: "待人工处理",
    no_match: "暂无匹配师傅",
    offering: "待接单",
    pending: "待处理",
    queued: "排队中",
    reassigning: "重新调度中",
    rejected: "已拒绝",
    timeout: "已超时",
  };
  return labels[status] ?? status;
}

export function formatNullable(value: string | null | undefined): string {
  return value || "-";
}
