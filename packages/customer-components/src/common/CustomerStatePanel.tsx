import type { ReactNode } from "react";
import { CustomerButton } from "./CustomerButton.js";

export type CustomerStateKind = "loading" | "empty" | "error" | "offline" | "success";

export interface CustomerStatePanelProps {
  kind: CustomerStateKind;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  icon?: ReactNode;
}

export function CustomerStatePanel({ kind, title, description, actionLabel, onAction, icon }: CustomerStatePanelProps) {
  const isLive = kind === "loading" || kind === "success";
  return (
    <section
      className="xlb-customer-state-panel"
      data-kind={kind}
      role={kind === "error" || kind === "offline" ? "alert" : "status"}
      aria-live={isLive ? "polite" : undefined}
      aria-busy={kind === "loading" || undefined}
    >
      {icon ? <span className="xlb-customer-state-panel__icon" aria-hidden="true">{icon}</span> : null}
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
      {actionLabel && onAction ? <CustomerButton variant="secondary" onClick={onAction}>{actionLabel}</CustomerButton> : null}
    </section>
  );
}
