import type {
  ButtonHTMLAttributes,
  CSSProperties,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { tokens } from "../tokens/index.js";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "muted";

const toneColors: Record<Tone, { background: string; border: string; text: string }> = {
  default: { background: "#ffffff", border: "#d1d5db", text: tokens.colors.text },
  primary: { background: "#eff6ff", border: tokens.colors.primary, text: "#1d4ed8" },
  success: { background: "#ecfdf5", border: "#10b981", text: "#047857" },
  warning: { background: "#fffbeb", border: "#f59e0b", text: "#b45309" },
  danger: { background: "#fef2f2", border: "#ef4444", text: "#b91c1c" },
  muted: { background: "#f9fafb", border: "#e5e7eb", text: "#6b7280" },
};

const radius = "8px";
const shadow = "0 1px 2px rgba(15, 23, 42, 0.08)";
const fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";

function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...override };
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
}

export function Button({ variant = "secondary", style, children, ...props }: ButtonProps) {
  const isPrimary = variant === "primary";
  const isDanger = variant === "danger";
  return (
    <button
      type="button"
      {...props}
      style={mergeStyle(
        {
          alignItems: "center",
          background: isPrimary ? tokens.colors.primary : isDanger ? "#dc2626" : "transparent",
          border: variant === "ghost" ? "1px solid transparent" : "1px solid #d1d5db",
          borderColor: isPrimary ? tokens.colors.primary : isDanger ? "#dc2626" : "#d1d5db",
          borderRadius: radius,
          color: isPrimary || isDanger ? "#ffffff" : tokens.colors.text,
          cursor: props.disabled ? "not-allowed" : "pointer",
          display: "inline-flex",
          fontFamily,
          fontSize: 14,
          fontWeight: 600,
          gap: 8,
          justifyContent: "center",
          minHeight: 36,
          opacity: props.disabled ? 0.56 : 1,
          padding: "0 14px",
          whiteSpace: "nowrap",
        },
        style,
      )}
    >
      {children}
    </button>
  );
}

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  actions?: ReactNode;
}

export function Card({ title, actions, style, children, ...props }: CardProps) {
  return (
    <section
      {...props}
      style={mergeStyle(
        {
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: radius,
          boxShadow: shadow,
          fontFamily,
          padding: tokens.spacing.md,
        },
        style,
      )}
    >
      {(title || actions) && (
        <div style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", marginBottom: 12 }}>
          {title && <h2 style={{ fontSize: 16, lineHeight: "22px", margin: 0 }}>{title}</h2>}
          {actions && <div style={{ display: "flex", gap: 8 }}>{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const controlStyle: CSSProperties = {
  background: "#ffffff",
  border: "1px solid #d1d5db",
  borderRadius: radius,
  boxSizing: "border-box",
  color: tokens.colors.text,
  fontFamily,
  fontSize: 14,
  minHeight: 36,
  padding: "7px 10px",
  width: "100%",
};

export function Input({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} style={mergeStyle(controlStyle, style)} />;
}

export function Select({ style, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} style={mergeStyle(controlStyle, style)}>
      {children}
    </select>
  );
}

export function Textarea({ style, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} style={mergeStyle({ ...controlStyle, minHeight: 88, resize: "vertical" }, style)} />;
}

export interface FormFieldProps {
  label: ReactNode;
  children: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
}

export function FormField({ label, children, description, error }: FormFieldProps) {
  return (
    <label style={{ display: "grid", fontFamily, gap: 6 }}>
      <span style={{ color: tokens.colors.text, fontSize: 13, fontWeight: 600 }}>{label}</span>
      {children}
      {description && !error && <span style={{ color: "#6b7280", fontSize: 12 }}>{description}</span>}
      {error && <span style={{ color: "#b91c1c", fontSize: 12 }}>{error}</span>}
    </label>
  );
}

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: Tone;
}

export function Badge({ tone = "default", style, children, ...props }: BadgeProps) {
  const color = toneColors[tone];
  return (
    <span
      {...props}
      style={mergeStyle(
        {
          alignItems: "center",
          background: color.background,
          border: `1px solid ${color.border}`,
          borderRadius: 999,
          color: color.text,
          display: "inline-flex",
          fontFamily,
          fontSize: 12,
          fontWeight: 600,
          lineHeight: "18px",
          padding: "1px 8px",
        },
        style,
      )}
    >
      {children}
    </span>
  );
}

export const StatusTag = Badge;

export interface TableColumn<Row> {
  key: string;
  title: ReactNode;
  render: (row: Row) => ReactNode;
  width?: number | string;
}

export interface TableProps<Row> {
  columns: Array<TableColumn<Row>>;
  rows: Row[];
  getRowKey: (row: Row, index: number) => string;
  emptyText?: ReactNode;
}

export function Table<Row>({ columns, rows, getRowKey, emptyText = "No records" }: TableProps<Row>) {
  if (rows.length === 0) {
    return <EmptyState title={emptyText} />;
  }

  return (
    <div style={{ overflowX: "auto", width: "100%" }}>
      <table style={{ borderCollapse: "collapse", fontFamily, fontSize: 14, minWidth: "100%", tableLayout: "fixed" }}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                style={{
                  borderBottom: "1px solid #e5e7eb",
                  color: "#4b5563",
                  fontWeight: 700,
                  padding: "10px 12px",
                  textAlign: "left",
                  width: column.width,
                }}
              >
                {column.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={getRowKey(row, index)}>
              {columns.map((column) => (
                <td key={column.key} style={{ borderBottom: "1px solid #f3f4f6", padding: "10px 12px", verticalAlign: "top" }}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export interface ModalProps {
  open: boolean;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}

export function Modal({ open, title, children, footer }: ModalProps) {
  if (!open) return null;
  return (
    <div style={{ background: "rgba(15, 23, 42, 0.35)", inset: 0, padding: 24, position: "fixed", zIndex: 50 }}>
      <Card style={{ margin: "8vh auto 0", maxWidth: 560 }}>
        {title && <h2 style={{ fontSize: 18, margin: "0 0 12px" }}>{title}</h2>}
        {children}
        {footer && <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>{footer}</div>}
      </Card>
    </div>
  );
}

export interface DrawerProps {
  open: boolean;
  title?: ReactNode;
  children: ReactNode;
}

export function Drawer({ open, title, children }: DrawerProps) {
  if (!open) return null;
  return (
    <aside
      style={{
        background: "#ffffff",
        borderLeft: "1px solid #e5e7eb",
        bottom: 0,
        boxShadow: "-8px 0 24px rgba(15, 23, 42, 0.12)",
        fontFamily,
        maxWidth: "100%",
        padding: tokens.spacing.lg,
        position: "fixed",
        right: 0,
        top: 0,
        width: 420,
        zIndex: 40,
      }}
    >
      {title && <h2 style={{ fontSize: 18, margin: "0 0 16px" }}>{title}</h2>}
      {children}
    </aside>
  );
}

export interface ToastProps extends HTMLAttributes<HTMLDivElement> {
  tone?: Tone;
}

export function Toast({ tone = "default", style, children, ...props }: ToastProps) {
  const color = toneColors[tone];
  return (
    <div
      {...props}
      role="status"
      style={mergeStyle(
        {
          background: color.background,
          border: `1px solid ${color.border}`,
          borderRadius: radius,
          color: color.text,
          fontFamily,
          fontSize: 14,
          padding: "10px 12px",
        },
        style,
      )}
    >
      {children}
    </div>
  );
}

export interface StateProps {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
}

function StateBlock({ title, description, action, tone = "muted" }: StateProps & { tone?: Tone }) {
  const color = toneColors[tone];
  return (
    <div
      style={{
        background: color.background,
        border: `1px solid ${color.border}`,
        borderRadius: radius,
        color: color.text,
        fontFamily,
        padding: tokens.spacing.lg,
        textAlign: "center",
      }}
    >
      {title && <strong style={{ display: "block", fontSize: 15, marginBottom: description ? 4 : 0 }}>{title}</strong>}
      {description && <p style={{ fontSize: 13, margin: "4px 0 0" }}>{description}</p>}
      {action && <div style={{ marginTop: 12 }}>{action}</div>}
    </div>
  );
}

export function EmptyState(props: StateProps) {
  return <StateBlock tone="muted" {...props} />;
}

export function ErrorState(props: StateProps) {
  return <StateBlock tone="danger" {...props} />;
}

export function LoadingState({ title = "Loading", description }: StateProps) {
  return <StateBlock tone="primary" title={title} description={description} />;
}

export function Skeleton({ style, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      aria-hidden="true"
      style={mergeStyle(
        {
          background: "linear-gradient(90deg, #f3f4f6 0%, #e5e7eb 50%, #f3f4f6 100%)",
          borderRadius: radius,
          height: 16,
          width: "100%",
        },
        style,
      )}
    />
  );
}

export interface TimelineItem {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
}

export function Timeline({ items }: { items: TimelineItem[] }) {
  return (
    <ol style={{ display: "grid", fontFamily, gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li key={item.key} style={{ borderLeft: `2px solid ${tokens.colors.primary}`, paddingLeft: 12 }}>
          <div style={{ alignItems: "baseline", display: "flex", gap: 8, justifyContent: "space-between" }}>
            <strong style={{ fontSize: 14 }}>{item.title}</strong>
            {item.meta && <span style={{ color: "#6b7280", fontSize: 12 }}>{item.meta}</span>}
          </div>
          {item.description && <div style={{ color: "#4b5563", fontSize: 13, marginTop: 2 }}>{item.description}</div>}
        </li>
      ))}
    </ol>
  );
}

export function PriceText({ amount, currency = "CNY" }: { amount: number; currency?: string }) {
  return (
    <span style={{ color: tokens.colors.text, fontFamily, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
      {currency} {(amount / 100).toFixed(2)}
    </span>
  );
}
