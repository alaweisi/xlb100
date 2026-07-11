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

export function formatNullable(value: string | null | undefined): string {
  return value || "-";
}
