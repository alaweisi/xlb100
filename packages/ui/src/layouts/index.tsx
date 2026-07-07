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
  style?: CSSProperties;
  contentStyle?: CSSProperties;
}

export function MobileShell({ topBar, bottomNav, children, style, contentStyle }: MobileShellProps) {
  return (
    <div
      style={mergeStyle(
        {
          background: "#f9fafb",
          color: tokens.colors.text,
          display: "grid",
          fontFamily,
          gridTemplateRows: `${topBar ? "auto " : ""}1fr${bottomNav ? " auto" : ""}`,
          minHeight: "100vh",
        },
        style,
      )}
    >
      {topBar}
      <main style={mergeStyle({ minWidth: 0, padding: tokens.spacing.md }, contentStyle)}>{children}</main>
      {bottomNav}
    </div>
  );
}

export interface AdminShellProps {
  sideNav?: ReactNode;
  topBar?: ReactNode;
  children: ReactNode;
  style?: CSSProperties;
  contentStyle?: CSSProperties;
}

export function AdminShell({ sideNav, topBar, children, style, contentStyle }: AdminShellProps) {
  return (
    <div
      style={mergeStyle(
        {
          background: "#f3f4f6",
          color: tokens.colors.text,
          display: "grid",
          fontFamily,
          gridTemplateColumns: sideNav ? "240px minmax(0, 1fr)" : "minmax(0, 1fr)",
          minHeight: "100vh",
        },
        style,
      )}
    >
      {sideNav}
      <div style={{ display: "grid", gridTemplateRows: `${topBar ? "auto " : ""}1fr`, minWidth: 0 }}>
        {topBar}
        <main style={mergeStyle({ minWidth: 0, padding: tokens.spacing.lg }, contentStyle)}>{children}</main>
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
  icon?: ReactNode;
  prominent?: boolean;
}

export function BottomNav({ items, style }: { items: NavItem[]; style?: CSSProperties }) {
  return (
    <nav
      style={mergeStyle(
        {
          background: "#ffffff",
          borderTop: "1px solid #e5e7eb",
          display: "grid",
          gridTemplateColumns: `repeat(${Math.max(items.length, 1)}, minmax(0, 1fr))`,
          paddingBottom: "env(safe-area-inset-bottom)",
        },
        style,
      )}
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
            alignItems: "center",
            color: item.prominent ? "var(--xlb-role-accent, #B85F2A)" : item.active ? "var(--xlb-role-accent, #B85F2A)" : "#4b5563",
            display: "grid",
            fontSize: 11,
            fontWeight: item.active ? 700 : 500,
            gap: 3,
            justifyItems: "center",
            minHeight: 54,
            padding: item.prominent ? "0 6px 8px" : "8px 6px 9px",
            textAlign: "center",
            textDecoration: "none",
          }}
        >
          {item.icon && (
            <span
              aria-hidden="true"
              style={{
                alignItems: "center",
                background: item.prominent ? "var(--xlb-role-accent, #B85F2A)" : "transparent",
                borderRadius: 999,
                boxShadow: item.prominent ? "0 10px 22px rgba(184, 95, 42, 0.28)" : "none",
                color: item.prominent ? "#ffffff" : "currentColor",
                display: "inline-flex",
                fontSize: item.prominent ? 26 : 21,
                height: item.prominent ? 58 : 24,
                justifyContent: "center",
                lineHeight: 1,
                marginTop: item.prominent ? -30 : 0,
                width: item.prominent ? 58 : 24,
              }}
            >
              {item.icon}
            </span>
          )}
          <span style={{ lineHeight: "14px", whiteSpace: "nowrap" }}>{item.label}</span>
        </a>
      ))}
    </nav>
  );
}

export function TopBar({ title, subtitle, actions, style }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; style?: CSSProperties }) {
  return (
    <header
      style={mergeStyle(
        {
          alignItems: "center",
          background: "#ffffff",
          borderBottom: "1px solid #e5e7eb",
          display: "flex",
          gap: 12,
          justifyContent: "space-between",
          minHeight: 56,
          padding: `0 ${tokens.spacing.lg}`,
        },
        style,
      )}
    >
      <div style={{ display: "grid", gap: 2, minWidth: 0 }}>
        <strong style={{ fontSize: 16, lineHeight: "20px" }}>{title}</strong>
        {subtitle && <span style={{ color: "#6b7280", fontSize: 12, lineHeight: "16px" }}>{subtitle}</span>}
      </div>
      {actions && <div style={{ alignItems: "center", display: "flex", gap: 8 }}>{actions}</div>}
    </header>
  );
}

export function SideNav({ items, title, style }: { items: NavItem[]; title?: ReactNode; style?: CSSProperties }) {
  return (
    <aside
      style={mergeStyle(
        {
          background: "#111827",
          color: "#ffffff",
          display: "grid",
          gap: 12,
          gridTemplateRows: "auto 1fr",
          padding: tokens.spacing.md,
        },
        style,
      )}
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
