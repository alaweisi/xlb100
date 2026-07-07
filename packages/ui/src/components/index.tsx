import type {
  ButtonHTMLAttributes,
  CSSProperties,
  FormEvent,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

import { tokens } from "../tokens/index.js";

export type Tone = "default" | "primary" | "success" | "warning" | "danger" | "muted";
export type RoleTone = "customer" | "worker" | "admin" | "neutral";
export type UiWorkflowActor = "customer" | "worker" | "admin";
export type UiWorkflowDisabledReason =
  | "API_NOT_AVAILABLE"
  | "WORKFLOW_NOT_IMPLEMENTED"
  | "DESIGN_SOURCE_MISSING"
  | "PHASE_BOUNDARY"
  | "CITY_SCOPE_REQUIRED"
  | "IDENTITY_REQUIRED"
  | "AUDIT_REQUIRED"
  | "EXECUTION_DISABLED"
  | "PERMISSION_DENIED"
  | "STATE_NOT_ACTIONABLE"
  | "IDEMPOTENCY_REQUIRED"
  | "CONFIRMATION_REQUIRED"
  | "BACKEND_ERROR";

export interface UiWorkflowActionContract {
  actionId: string;
  label: string;
  enabled: boolean;
  disabledReasonCode: UiWorkflowDisabledReason | null;
  source: "backend" | "api-derived" | "not-wired";
  danger: boolean;
  confirmRequired: boolean;
  idempotencyRequired: boolean;
  auditRequired: boolean;
  cityScopeRequired: boolean;
  endpoint?: string;
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
}

export interface UiWorkflowCustomerAnswer {
  currentStep: string;
  nextAvailableStep: string;
  blockedReason?: string;
  estimatedTime?: string;
  recoveryPath?: string;
}

export interface UiWorkflowWorkerAnswer {
  canAcceptOrder: boolean;
  serviceCity?: string;
  certificationPassed?: boolean;
  blockedReason?: string;
  nextStep: string;
  walletWired: boolean;
}

export interface UiWorkflowState {
  stateId: string;
  label: string;
  source: string;
  terminal?: boolean;
  customerAnswer?: UiWorkflowCustomerAnswer;
  workerAnswer?: UiWorkflowWorkerAnswer;
}

export interface UiWorkflowBindingSummary {
  workflowName: string;
  actor: UiWorkflowActor;
  backendSource: {
    endpoints: string[];
    status: string;
  };
  state: UiWorkflowState;
  disabledReasons: UiWorkflowDisabledReason[];
  figmaBinding: {
    kind: string;
    frameName?: string;
  };
  runtimeThemeTokens: {
    activeThemeId: string;
    affects: "visual-only";
  };
}

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

const roleAccents: Record<RoleTone, { background: string; border: string; accent: string; text: string }> = {
  customer: { background: "#fff7ed", border: "#fed7aa", accent: "#B85F2A", text: "#2B2118" },
  worker: { background: "#eef6ff", border: "#bfdbfe", accent: "#08172B", text: "#0f172a" },
  admin: { background: "#f6f3fb", border: "#ddd6fe", accent: "#5b21b6", text: "#191225" },
  neutral: { background: "#f9fafb", border: "#e5e7eb", accent: tokens.colors.primary, text: tokens.colors.text },
};

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

export interface SearchBarProps extends Omit<HTMLAttributes<HTMLFormElement>, "onChange" | "onSubmit"> {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  disabled?: boolean;
  leadingIcon?: ReactNode;
  inputStyle?: CSSProperties;
}

export function SearchBar({
  value,
  placeholder,
  onChange,
  onSubmit,
  disabled,
  leadingIcon,
  inputStyle,
  style,
  children,
  ...props
}: SearchBarProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!disabled) onSubmit?.(value);
  }

  return (
    <form
      {...props}
      onSubmit={handleSubmit}
      style={mergeStyle(
        {
          alignItems: "center",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          boxSizing: "border-box",
          display: "flex",
          fontFamily,
          gap: 8,
          minHeight: 44,
          opacity: disabled ? 0.62 : 1,
          padding: "0 12px",
          width: "100%",
        },
        style,
      )}
    >
      <span aria-hidden="true" style={{ color: "#6b7280", flex: "0 0 auto", fontSize: 14, lineHeight: 1 }}>
         {leadingIcon ?? "🔍"}
      </span>
      <input
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type="search"
        value={value}
        style={mergeStyle(
          {
            background: "transparent",
            border: 0,
            color: tokens.colors.text,
            flex: "1 1 auto",
            fontFamily,
            fontSize: 14,
            minHeight: 40,
            minWidth: 0,
            outline: "none",
          },
          inputStyle,
        )}
      />
      {children}
    </form>
  );
}

export interface LocationSearchBarProps extends Omit<HTMLAttributes<HTMLDivElement>, "onSubmit"> {
  cityLabel: string;
  areaLabel?: string;
  placeholder?: string;
  value: string;
  onSearchChange: (value: string) => void;
  onCityClick?: () => void;
}

export function LocationSearchBar({
  cityLabel,
  areaLabel,
  placeholder,
  value,
  onSearchChange,
  onCityClick,
  style,
  ...props
}: LocationSearchBarProps) {
  return (
    <div {...props} style={mergeStyle({ display: "grid", gap: 10, width: "100%" }, style)}>
      <button
        onClick={onCityClick}
        type="button"
        style={{
          alignItems: "center",
          background: "rgba(255, 255, 255, 0.96)",
          border: "1px solid #ead8bd",
          borderRadius: 16,
          color: tokens.colors.text,
          cursor: onCityClick ? "pointer" : "default",
          display: "flex",
          fontFamily,
          fontSize: 14,
          gap: 8,
          justifyContent: "space-between",
          letterSpacing: 0,
          minHeight: 42,
          padding: "0 12px",
          textAlign: "left",
          width: "100%",
        }}
      >
        <span aria-hidden="true" style={{ color: "#6b7280", fontSize: 14, fontWeight: 700 }}>
          {`📍 ${cityLabel}`}
        </span>
        <span style={{ color: "#6b7280", fontSize: 13, fontWeight: 500, opacity: onCityClick ? 1 : 0.8 }}>
          {areaLabel ?? "切换服务城市"}
        </span>
      </button>
      <SearchBar
        value={value}
        onChange={onSearchChange}
        placeholder={placeholder}
        leadingIcon="🔍"
        style={{ borderColor: "#ead8bd", borderRadius: 16, minHeight: 44 }}
      />
    </div>
  );
}

export interface QuantityStepperProps {
  value: number;
  min?: number;
  max?: number;
  onChange: (value: number) => void;
  disabled?: boolean;
}

export function QuantityStepper({ value, min = 1, max, onChange, disabled }: QuantityStepperProps) {
  const safeValue = Number.isFinite(value) ? Math.max(min, value) : min;
  const clampedValue = max === undefined ? safeValue : Math.min(max, safeValue);
  const canDecrease = clampedValue > min;
  const canIncrease = max === undefined || clampedValue < max;

  function decrement() {
    if (!disabled && canDecrease) {
      onChange(clampedValue - 1);
    }
  }

  function increment() {
    if (!disabled && canIncrease) {
      onChange(clampedValue + 1);
    }
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "42px 1fr 42px", gap: 8, width: "100%" }}>
      <Button
        disabled={disabled || !canDecrease}
        onClick={decrement}
        style={{ borderRadius: 10, minHeight: 36, padding: 0 }}
        type="button"
        variant="secondary"
      >
        -
      </Button>
      <div
        style={{
          alignItems: "center",
          background: "#ffffff",
          border: "1px solid #d1d5db",
          borderRadius: 10,
          color: tokens.colors.text,
          display: "flex",
          fontFamily,
          fontSize: 14,
          fontWeight: 700,
          justifyContent: "center",
          minHeight: 36,
        }}
      >
        {clampedValue}
      </div>
      <Button
        disabled={disabled || !canIncrease}
        onClick={increment}
        style={{ borderRadius: 10, minHeight: 36, padding: 0 }}
        type="button"
        variant="secondary"
      >
        +
      </Button>
    </div>
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

export interface StateBadgeProps extends BadgeProps {
  label?: ReactNode;
}

export function StateBadge({ tone = "muted", label, children, ...props }: StateBadgeProps) {
  return (
    <Badge tone={tone} {...props}>
      {label ?? children}
    </Badge>
  );
}

export interface ScopeBadgeProps extends BadgeProps {
  scope: ReactNode;
}

export function ScopeBadge({ scope, tone = "primary", ...props }: ScopeBadgeProps) {
  return (
    <Badge tone={tone} title="scope" {...props}>
      {scope}
    </Badge>
  );
}

export interface TabItem {
  key: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  density?: "default" | "compact";
}

export function Tabs({ items, activeKey, onChange, density = "default", style, ...props }: TabsProps) {
  const compact = density === "compact";
  return (
    <div
      {...props}
      role="tablist"
      style={mergeStyle(
        {
          background: "#f3f4f6",
          border: "1px solid #e5e7eb",
          borderRadius: 999,
          boxSizing: "border-box",
          display: "inline-flex",
          fontFamily,
          gap: 4,
          maxWidth: "100%",
          overflowX: "auto",
          padding: 4,
        },
        style,
      )}
    >
      {items.map((item) => {
        const active = item.key === activeKey;
        return (
          <button
            aria-selected={active}
            disabled={item.disabled}
            key={item.key}
            onClick={() => onChange(item.key)}
            role="tab"
            type="button"
            style={{
              background: active ? "#ffffff" : "transparent",
              border: 0,
              borderRadius: 999,
              boxShadow: active ? shadow : "none",
              color: active ? tokens.colors.text : "#6b7280",
              cursor: item.disabled ? "not-allowed" : "pointer",
              flex: "0 0 auto",
              fontFamily,
              fontSize: compact ? 12 : 14,
              fontWeight: active ? 700 : 600,
              minHeight: compact ? 28 : 34,
              opacity: item.disabled ? 0.5 : 1,
              padding: compact ? "0 10px" : "0 14px",
              whiteSpace: "nowrap",
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export const SegmentedControl = Tabs;

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

export function Table<Row>({ columns, rows, getRowKey, emptyText = "暂无记录" }: TableProps<Row>) {
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

export interface BottomSheetProps {
  open: boolean;
  onClose?: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  style?: CSSProperties;
}

export function BottomSheet({ open, onClose, title, children, footer, style }: BottomSheetProps) {
  if (!open) return null;
  return (
    <div
      aria-modal="true"
      role="dialog"
      style={{
        alignItems: "end",
        background: "rgba(15, 23, 42, 0.36)",
        display: "grid",
        inset: 0,
        padding: "16px 12px 0",
        position: "fixed",
        zIndex: 50,
      }}
    >
      <section
        style={mergeStyle(
          {
            background: "#ffffff",
            border: "1px solid #e5e7eb",
            borderBottom: 0,
            borderRadius: "24px 24px 0 0",
            boxShadow: "0 -12px 32px rgba(15, 23, 42, 0.16)",
            boxSizing: "border-box",
            fontFamily,
            margin: "0 auto",
            maxHeight: "86vh",
            maxWidth: 520,
            overflow: "auto",
            padding: `${tokens.spacing.lg} ${tokens.spacing.lg} calc(${tokens.spacing.lg} + env(safe-area-inset-bottom))`,
            width: "100%",
          },
          style,
        )}
      >
        {(title || onClose) && (
          <header style={{ alignItems: "center", display: "flex", gap: 12, justifyContent: "space-between", marginBottom: 16 }}>
            {title && <h2 style={{ fontSize: 18, lineHeight: "24px", margin: 0 }}>{title}</h2>}
            {onClose && (
              <button
                aria-label="Close"
                onClick={onClose}
                type="button"
                style={{
                  background: "#f3f4f6",
                  border: "1px solid #e5e7eb",
                  borderRadius: 999,
                  color: tokens.colors.text,
                  cursor: "pointer",
                  flex: "0 0 auto",
                  fontSize: 16,
                  height: 32,
                  lineHeight: "30px",
                  padding: 0,
                  textAlign: "center",
                  width: 32,
                }}
              >
                ×
              </button>
            )}
          </header>
        )}
        <div>{children}</div>
        {footer && <footer style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>{footer}</footer>}
      </section>
    </div>
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

export function LoadingState({ title = "加载中", description }: StateProps) {
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

const disabledReasonCopy: Record<UiWorkflowDisabledReason, string> = {
  API_NOT_AVAILABLE: "真实 API 暂未接入",
  WORKFLOW_NOT_IMPLEMENTED: "工作流暂未实现",
  DESIGN_SOURCE_MISSING: "缺少对应 Figma 设计源",
  PHASE_BOUNDARY: "当前阶段不允许执行",
  CITY_SCOPE_REQUIRED: "需要后端城市作用域",
  IDENTITY_REQUIRED: "需要真实身份上下文",
  AUDIT_REQUIRED: "需要审计链路",
  EXECUTION_DISABLED: "执行动作已禁用",
  PERMISSION_DENIED: "后端权限不允许",
  STATE_NOT_ACTIONABLE: "当前状态不可操作",
  IDEMPOTENCY_REQUIRED: "需要幂等保护",
  CONFIRMATION_REQUIRED: "需要二次确认",
  BACKEND_ERROR: "后端返回错误",
};

export interface DisabledReasonTextProps extends Omit<HTMLAttributes<HTMLParagraphElement>, "prefix"> {
  reason: UiWorkflowDisabledReason | null;
  prefix?: ReactNode;
}

export function DisabledReasonText({ reason, prefix = "不可用原因", style, ...props }: DisabledReasonTextProps) {
  if (!reason) return null;
  return (
    <p
      {...props}
      style={mergeStyle(
        {
          color: toneColors.warning.text,
          fontFamily,
          fontSize: 12,
          lineHeight: "18px",
          margin: "6px 0 0",
        },
        style,
      )}
    >
      {prefix}: {disabledReasonCopy[reason]}
    </p>
  );
}

export interface ActionDockProps extends Omit<HTMLAttributes<HTMLDivElement>, "onAction"> {
  actions: UiWorkflowActionContract[];
  onAction?: (action: UiWorkflowActionContract) => void;
  density?: "default" | "compact";
  showDisabledReason?: boolean;
}

export function ActionDock({
  actions,
  onAction,
  density = "default",
  showDisabledReason = true,
  style,
  ...props
}: ActionDockProps) {
  if (actions.length === 0) return null;
  const compact = density === "compact";
  return (
    <div
      {...props}
      style={mergeStyle(
        {
          display: "grid",
          fontFamily,
          gap: compact ? 6 : 8,
        },
        style,
      )}
    >
      <div style={{ display: "flex", flexWrap: "wrap", gap: compact ? 6 : 8 }}>
        {actions.map((action) => (
          <Button
            disabled={!action.enabled}
            key={action.actionId}
            onClick={() => {
              if (action.enabled) onAction?.(action);
            }}
            style={{ flex: compact ? "0 0 auto" : "1 1 160px", minHeight: compact ? 34 : 44 }}
            title={action.disabledReasonCode ? disabledReasonCopy[action.disabledReasonCode] : action.actionId}
            variant={action.danger ? "danger" : action.enabled ? "primary" : "secondary"}
          >
            {action.label}
          </Button>
        ))}
      </div>
      {showDisabledReason &&
        actions
          .filter((action) => !action.enabled && action.disabledReasonCode)
          .map((action) => (
            <DisabledReasonText
              key={`${action.actionId}-reason`}
              prefix={action.label}
              reason={action.disabledReasonCode}
            />
          ))}
    </div>
  );
}

export interface WorkflowTimelineItem {
  key: string;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  state?: "complete" | "current" | "blocked" | "pending";
}

export function WorkflowTimeline({ items }: { items: WorkflowTimelineItem[] }) {
  const toneByState: Record<NonNullable<WorkflowTimelineItem["state"]>, string> = {
    complete: "#10b981",
    current: tokens.colors.primary,
    blocked: "#f59e0b",
    pending: "#d1d5db",
  };

  return (
    <ol style={{ display: "grid", fontFamily, gap: 12, listStyle: "none", margin: 0, padding: 0 }}>
      {items.map((item) => (
        <li
          key={item.key}
          style={{
            borderLeft: `2px solid ${toneByState[item.state ?? "pending"]}`,
            paddingLeft: 12,
          }}
        >
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

export interface WorkflowStatePanelProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  binding: Pick<
    UiWorkflowBindingSummary,
    "workflowName" | "backendSource" | "state" | "disabledReasons" | "figmaBinding"
  >;
  title?: ReactNode;
}

export function WorkflowStatePanel({ binding, title = "工作流绑定", style, ...props }: WorkflowStatePanelProps) {
  const blockedReason = binding.disabledReasons[0] ?? null;
  const sourceText = binding.backendSource.endpoints.length > 0
    ? binding.backendSource.endpoints.join(" / ")
    : binding.backendSource.status;

  return (
    <GuardrailCard
      {...props}
      title={title}
      actions={<StatusTag tone={blockedReason ? "warning" : "success"}>{binding.state.label}</StatusTag>}
      style={mergeStyle({ boxShadow: "none" }, style)}
      tone={blockedReason ? "warning" : "success"}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700 }}>{binding.workflowName}</span>
        <span style={{ color: "#4b5563", fontSize: 12, lineHeight: "18px" }}>
          来源: {sourceText}
        </span>
        <span style={{ color: "#4b5563", fontSize: 12, lineHeight: "18px" }}>
          Figma: {binding.figmaBinding.kind}{binding.figmaBinding.frameName ? ` / ${binding.figmaBinding.frameName}` : ""}
        </span>
        <DisabledReasonText reason={blockedReason} />
      </div>
    </GuardrailCard>
  );
}

function answerText(answer: UiWorkflowCustomerAnswer | UiWorkflowWorkerAnswer): Array<[string, ReactNode]> {
  if ("currentStep" in answer) {
    return [
      ["当前步骤", answer.currentStep],
      ["下一步", answer.nextAvailableStep],
      ["阻塞原因", answer.blockedReason ?? "无"],
      ["恢复路径", answer.recoveryPath ?? "按真实 API 状态继续"],
    ];
  }

  return [
    ["可接单", answer.canAcceptOrder ? "后端允许" : "后端未允许"],
    ["服务城市", answer.serviceCity ?? "等待后端返回"],
    ["资质状态", answer.certificationPassed === undefined ? "等待后端返回" : answer.certificationPassed ? "已通过" : "未通过"],
    ["下一步", answer.nextStep],
    ["钱包接线", answer.walletWired ? "已接线" : "未接线"],
  ];
}

function AnswerCard({
  title,
  answer,
}: {
  title: ReactNode;
  answer: UiWorkflowCustomerAnswer | UiWorkflowWorkerAnswer;
}) {
  return (
    <Card title={title}>
      <dl style={{ display: "grid", gap: 8, margin: 0 }}>
        {answerText(answer).map(([label, value]) => (
          <div key={label} style={{ display: "grid", gap: 2 }}>
            <dt style={{ color: "#64748b", fontSize: 12, fontWeight: 700 }}>{label}</dt>
            <dd style={{ color: tokens.colors.text, fontSize: 13, lineHeight: "20px", margin: 0 }}>{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function CustomerAnswerCard({ state }: { state: UiWorkflowState }) {
  if (!state.customerAnswer) return null;
  return <AnswerCard title="用户当前能做什么" answer={state.customerAnswer} />;
}

export function WorkerAnswerCard({ state }: { state: UiWorkflowState }) {
  if (!state.workerAnswer) return null;
  return <AnswerCard title="师傅当前能做什么" answer={state.workerAnswer} />;
}

export interface RuntimeThemeSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  binding: Pick<UiWorkflowBindingSummary, "actor" | "runtimeThemeTokens">;
}

export function RuntimeThemeSurface({ binding, style, children, ...props }: RuntimeThemeSurfaceProps) {
  return (
    <div
      {...props}
      data-runtime-theme={binding.runtimeThemeTokens.activeThemeId}
      data-runtime-theme-affects={binding.runtimeThemeTokens.affects}
      data-workflow-actor={binding.actor}
      style={mergeStyle({ display: "grid", gap: 14 }, style)}
    >
      {children}
    </div>
  );
}

export interface StatCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  trend?: ReactNode;
  tone?: Tone;
}

export function StatCard({ label, value, hint, trend, tone = "default", style, ...props }: StatCardProps) {
  const color = toneColors[tone];
  return (
    <section
      {...props}
      style={mergeStyle(
        {
          background: "#ffffff",
          border: `1px solid ${color.border}`,
          borderRadius: radius,
          boxShadow: shadow,
          boxSizing: "border-box",
          display: "grid",
          fontFamily,
          gap: 8,
          minHeight: 108,
          padding: tokens.spacing.md,
        },
        style,
      )}
    >
      <div style={{ alignItems: "center", color: "#6b7280", display: "flex", fontSize: 13, fontWeight: 600, gap: 8, justifyContent: "space-between" }}>
        <span>{label}</span>
        {trend && <span style={{ color: color.text, fontSize: 12 }}>{trend}</span>}
      </div>
      <strong style={{ color: tokens.colors.text, fontSize: 24, fontVariantNumeric: "tabular-nums", lineHeight: "30px" }}>{value}</strong>
      {hint && <span style={{ color: "#6b7280", fontSize: 12 }}>{hint}</span>}
    </section>
  );
}

export interface MetricCardProps extends Omit<StatCardProps, "role"> {
  productRole?: RoleTone;
}

export function MetricCard({ productRole = "neutral", style, ...props }: MetricCardProps) {
  const roleTone = roleAccents[productRole];
  return (
    <StatCard
      {...props}
      style={mergeStyle(
        {
          background: roleTone.background,
          borderColor: roleTone.border,
        },
        style,
      )}
    />
  );
}

export interface HeroCardProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "role"> {
  productRole?: RoleTone;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  footer?: ReactNode;
}

export function HeroCard({ productRole = "neutral", eyebrow, title, description, actions, footer, style, ...props }: HeroCardProps) {
  const color = roleAccents[productRole];
  return (
    <section
      {...props}
      style={mergeStyle(
        {
          background: color.background,
          border: `1px solid ${color.border}`,
          borderRadius: radius,
          boxShadow: `0 16px 38px rgba(15, 23, 42, ${productRole === "neutral" ? "0.08" : "0.12"})`,
          boxSizing: "border-box",
          color: color.text,
          display: "grid",
          fontFamily,
          gap: 12,
          padding: tokens.spacing.lg,
        },
        style,
      )}
    >
      {eyebrow && <p style={{ color: color.accent, fontSize: 12, fontWeight: 800, letterSpacing: 0, margin: 0 }}>{eyebrow}</p>}
      <div style={{ alignItems: "start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
          <h1 style={{ color: color.text, fontSize: 28, lineHeight: "36px", margin: 0 }}>{title}</h1>
          {description && <p style={{ color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 }}>{description}</p>}
        </div>
        {actions && <div style={{ alignItems: "center", display: "flex", flex: "0 0 auto", gap: 8 }}>{actions}</div>}
      </div>
      {footer && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{footer}</div>}
    </section>
  );
}

export interface GuardrailCardProps extends CardProps {
  tone?: Tone;
}

export function GuardrailCard({ tone = "warning", title, actions, style, children, ...props }: GuardrailCardProps) {
  const color = toneColors[tone];
  return (
    <Card
      {...props}
      title={title}
      actions={actions}
      style={mergeStyle(
        {
          background: color.background,
          borderColor: color.border,
          color: color.text,
        },
        style,
      )}
    >
      {children}
    </Card>
  );
}

export interface NotWiredStateProps extends StateProps {
  capability?: ReactNode;
}

export function NotWiredState({ capability, title = "能力未接线", description, action }: NotWiredStateProps) {
  return (
    <StateBlock
      tone="warning"
      title={title}
      description={
        <>
          {capability && <span style={{ display: "block", fontWeight: 700, marginBottom: 4 }}>{capability}</span>}
          {description}
        </>
      }
      action={action}
    />
  );
}

export interface ApiErrorPanelProps extends StateProps {
  detail?: ReactNode;
}

export function ApiErrorPanel({ title = "请求失败", description, detail, action }: ApiErrorPanelProps) {
  return (
    <ErrorState
      title={title}
      description={
        <>
          {description}
          {detail && <span style={{ display: "block", fontFamily: "monospace", marginTop: 6, wordBreak: "break-word" }}>{detail}</span>}
        </>
      }
      action={action}
    />
  );
}

export interface AdminToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
}

export function AdminToolbar({ title, description, actions, meta, style, children, ...props }: AdminToolbarProps) {
  return (
    <div
      {...props}
      style={mergeStyle(
        {
          alignItems: "center",
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: radius,
          boxShadow: shadow,
          display: "flex",
          fontFamily,
          gap: 12,
          justifyContent: "space-between",
          padding: tokens.spacing.md,
        },
        style,
      )}
    >
      <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
        {title && <strong style={{ fontSize: 16, lineHeight: "22px" }}>{title}</strong>}
        {description && <span style={{ color: "#6b7280", fontSize: 13, lineHeight: "18px" }}>{description}</span>}
        {children}
      </div>
      {(meta || actions) && (
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
          {meta}
          {actions}
        </div>
      )}
    </div>
  );
}

export interface CustomerQuoteCardProps extends Omit<CardProps, "title"> {
  price: ReactNode;
  label?: ReactNode;
  meta?: ReactNode;
  status?: ReactNode;
}

export function CustomerQuoteCard({ price, label = "当前报价", meta, status, style, children, ...props }: CustomerQuoteCardProps) {
  return (
    <Card
      {...props}
      actions={status}
      title={label}
      style={mergeStyle({ borderColor: "#bbf7d0", boxShadow: "0 12px 28px rgba(16, 185, 129, 0.10)" }, style)}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <div style={{ fontSize: 24, lineHeight: "30px" }}>{price}</div>
        {meta && <p style={{ color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 }}>{meta}</p>}
        {children}
      </div>
    </Card>
  );
}

export interface WorkerStatusCardProps extends WorkOrderCardProps {
  boundary?: ReactNode;
}

export function WorkerStatusCard({ boundary, children, ...props }: WorkerStatusCardProps) {
  return (
    <WorkOrderCard {...props}>
      {boundary && <p style={{ color: "#64748b", fontSize: 13, lineHeight: "20px", margin: 0 }}>{boundary}</p>}
      {children}
    </WorkOrderCard>
  );
}

export interface ServiceCardProps extends Omit<HTMLAttributes<HTMLElement>, "title" | "onClick"> {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  priceText?: ReactNode;
  actionLabel?: ReactNode;
  onClick?: () => void;
  status?: ReactNode;
}

export function ServiceCard({ title, subtitle, icon, priceText, actionLabel, onClick, status, style, ...props }: ServiceCardProps) {
  const interactive = Boolean(onClick);
  return (
    <section
      {...props}
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      role={interactive ? "button" : props.role}
      tabIndex={interactive ? 0 : props.tabIndex}
      style={mergeStyle(
        {
          background: "#ffffff",
          border: "1px solid #e5e7eb",
          borderRadius: radius,
          boxShadow: shadow,
          boxSizing: "border-box",
          cursor: interactive ? "pointer" : "default",
          display: "grid",
          fontFamily,
          gap: 10,
          minHeight: 118,
          padding: tokens.spacing.md,
        },
        style,
      )}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 12 }}>
        {icon && <div style={{ flex: "0 0 auto" }}>{icon}</div>}
        <div style={{ display: "grid", flex: "1 1 auto", gap: 4, minWidth: 0 }}>
          <strong style={{ color: tokens.colors.text, fontSize: 15, lineHeight: "20px" }}>{title}</strong>
          {subtitle && <span style={{ color: "#6b7280", fontSize: 13, lineHeight: "18px" }}>{subtitle}</span>}
        </div>
        {status && <div style={{ flex: "0 0 auto" }}>{status}</div>}
      </div>
      {(priceText || actionLabel) && (
        <div style={{ alignItems: "center", display: "flex", gap: 10, justifyContent: "space-between" }}>
          {priceText && <span style={{ color: tokens.colors.text, fontSize: 13, fontWeight: 700 }}>{priceText}</span>}
          {actionLabel && <span style={{ color: tokens.colors.primary, fontSize: 13, fontWeight: 700 }}>{actionLabel}</span>}
        </div>
      )}
    </section>
  );
}

export interface OrderCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  status?: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  priceText?: ReactNode;
  actions?: ReactNode;
}

export function OrderCard({ title, status, description, meta, priceText, actions, style, children, ...props }: OrderCardProps) {
  return (
    <Card
      {...props}
      style={mergeStyle(
        {
          display: "grid",
          gap: 12,
        },
        style,
      )}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <strong style={{ color: tokens.colors.text, fontSize: 15, lineHeight: "20px" }}>{title}</strong>
          {description && <span style={{ color: "#4b5563", fontSize: 13, lineHeight: "18px" }}>{description}</span>}
        </div>
        {status && <div style={{ flex: "0 0 auto" }}>{status}</div>}
      </div>
      {(meta || priceText) && (
        <div style={{ alignItems: "center", color: "#6b7280", display: "flex", fontSize: 13, gap: 12, justifyContent: "space-between" }}>
          {meta && <span>{meta}</span>}
          {priceText && <strong style={{ color: tokens.colors.text, fontVariantNumeric: "tabular-nums" }}>{priceText}</strong>}
        </div>
      )}
      {children}
      {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>{actions}</div>}
    </Card>
  );
}

export interface WorkOrderCardProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title: ReactNode;
  status?: ReactNode;
  location?: ReactNode;
  timeWindow?: ReactNode;
  priceText?: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
}

export function WorkOrderCard({ title, status, location, timeWindow, priceText, meta, actions, style, children, ...props }: WorkOrderCardProps) {
  return (
    <Card
      {...props}
      style={mergeStyle(
        {
          display: "grid",
          gap: 12,
        },
        style,
      )}
    >
      <div style={{ alignItems: "flex-start", display: "flex", gap: 12, justifyContent: "space-between" }}>
        <strong style={{ color: tokens.colors.text, fontSize: 15, lineHeight: "20px", minWidth: 0 }}>{title}</strong>
        {status && <div style={{ flex: "0 0 auto" }}>{status}</div>}
      </div>
      <div style={{ color: "#4b5563", display: "grid", fontSize: 13, gap: 6 }}>
        {location && <span>{location}</span>}
        {timeWindow && <span>{timeWindow}</span>}
        {meta && <span>{meta}</span>}
      </div>
      {children}
      {(priceText || actions) && (
        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: 10, justifyContent: "space-between" }}>
          {priceText && <strong style={{ color: tokens.colors.text, fontVariantNumeric: "tabular-nums" }}>{priceText}</strong>}
          {actions && <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div>}
        </div>
      )}
    </Card>
  );
}

export const WorkerTaskCard = WorkOrderCard;

export function PriceText({
  amount,
  currency = "CNY",
  unit = "major",
  style,
}: {
  amount: number;
  currency?: string;
  unit?: "major" | "minor";
  style?: CSSProperties;
}) {
  const value = unit === "minor" ? amount / 100 : amount;
  const prefix = currency === "CNY" ? "¥" : `${currency} `;
  return (
    <span
      style={mergeStyle(
        {
          color: tokens.colors.text,
          fontFamily,
          fontVariantNumeric: "tabular-nums",
          fontWeight: 700,
        },
        style,
      )}
    >
      {prefix}
      {value.toFixed(2)}
    </span>
  );
}
