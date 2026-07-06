import type { CSSProperties, ReactNode } from "react";

import { tokens } from "../tokens/index.js";

const fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...override };
}

export interface PageShellProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
}

export function PageShell({ title, subtitle, actions, children, style }: PageShellProps) {
  return (
    <main
      style={mergeStyle(
        {
          background: "#f9fafb",
          color: tokens.colors.text,
          fontFamily,
          minHeight: "100vh",
          padding: tokens.spacing.lg,
        },
        style,
      )}
    >
      {(title || subtitle || actions) && (
        <header style={{ alignItems: "flex-start", display: "flex", gap: 16, justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            {title && <h1 style={{ fontSize: 24, lineHeight: "32px", margin: 0 }}>{title}</h1>}
            {subtitle && <p style={{ color: "#6b7280", fontSize: 14, margin: "4px 0 0" }}>{subtitle}</p>}
          </div>
          {actions && <div style={{ alignItems: "center", display: "flex", gap: 8 }}>{actions}</div>}
        </header>
      )}
      {children}
    </main>
  );
}

export interface MobileShellProps {
  topBar?: ReactNode;
  bottomNav?: ReactNode;
  children: ReactNode;
}

export function MobileShell({ topBar, bottomNav, children }: MobileShellProps) {
  return (
    <div
      style={{
        background: "#f9fafb",
        color: tokens.colors.text,
        display: "grid",
        fontFamily,
        gridTemplateRows: `${topBar ? "auto " : ""}1fr${bottomNav ? " auto" : ""}`,
        minHeight: "100vh",
      }}
    >
      {topBar}
      <main style={{ minWidth: 0, padding: tokens.spacing.md }}>{children}</main>
      {bottomNav}
    </div>
  );
}

export interface AdminShellProps {
  sideNav?: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
}

export function AdminShell({ sideNav, topBar, children }: AdminShellProps) {
  return (
    <div
      style={{
        background: "#f3f4f6",
        color: tokens.colors.text,
        display: "grid",
        fontFamily,
        gridTemplateColumns: sideNav ? "240px minmax(0, 1fr)" : "minmax(0, 1fr)",
        minHeight: "100vh",
      }}
    >
      {sideNav}
      <div style={{ display: "grid", gridTemplateRows: `${topBar ? "auto " : ""}1fr`, minWidth: 0 }}>
        {topBar}
        <main style={{ minWidth: 0, padding: tokens.spacing.lg }}>{children}</main>
      </div>
    </div>
  );
}

export interface NavItem {
  key: string;
  label: ReactNode;
  active?: boolean;
  href?: string;
  onClick?: () => void;
}

export function BottomNav({ items }: { items: NavItem[] }) {
  return (
    <nav
      style={{
        background: "#ffffff",
        borderTop: "1px solid #e5e7eb",
        display: "grid",
        gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`,
      }}
    >
      {items.map((item) => (
        <a
          href={item.href ?? "#"}
          key={item.key}
          onClick={(event) => {
            if (item.onClick) {
              event.preventDefault();
              item.onClick();
            }
          }}
          style={{
            color: item.active ? tokens.colors.primary : "#4b5563",
            fontSize: 12,
            fontWeight: item.active ? 700 : 500,
            padding: "10px 6px",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}

export function TopBar({ title, actions }: { title?: ReactNode; actions?: ReactNode }) {
  return (
    <header
      style={{
        alignItems: "center",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        gap: 12,
        justifyContent: "space-between",
        minHeight: 56,
        padding: `0 ${tokens.spacing.lg}`,
      }}
    >
      <strong style={{ fontSize: 16 }}>{title}</strong>
      {actions && <div style={{ alignItems: "center", display: "flex", gap: 8 }}>{actions}</div>}
    </header>
  );
}

export function SideNav({ items, title }: { items: NavItem[]; title?: ReactNode }) {
  return (
    <aside
      style={{
        background: "#111827",
        color: "#ffffff",
        display: "grid",
        gap: 12,
        gridTemplateRows: "auto 1fr",
        padding: tokens.spacing.md,
      }}
    >
      {title && <strong style={{ fontSize: 16, padding: "8px 10px" }}>{title}</strong>}
      <nav style={{ display: "grid", gap: 4 }}>
        {items.map((item) => (
          <a
            href={item.href ?? "#"}
            key={item.key}
            onClick={(event) => {
              if (item.onClick) {
                event.preventDefault();
                item.onClick();
              }
            }}
            style={{
              background: item.active ? "rgba(37, 99, 235, 0.28)" : "transparent",
              borderRadius: 8,
              color: "#ffffff",
              fontSize: 14,
              fontWeight: item.active ? 700 : 500,
              padding: "9px 10px",
              textDecoration: "none",
            }}
          >
            {item.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}
