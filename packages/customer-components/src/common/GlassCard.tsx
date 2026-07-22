import type { HTMLAttributes, ReactNode } from "react";

export interface GlassCardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
  children: ReactNode;
}

export function GlassCard({ as: Element = "section", children, className, ...props }: GlassCardProps) {
  const classes = ["xlb-customer-glass-card", className].filter(Boolean).join(" ");
  return <Element {...props} className={classes}>{children}</Element>;
}
