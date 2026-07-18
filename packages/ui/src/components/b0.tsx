import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

import { ServiceCard, type ServiceCardProps } from "./index.js";

export type B0Role = "customer" | "worker" | "admin" | "neutral";
export type LiquidGlassPurpose = "navigation" | "control" | "overlay";

const roleFallbacks: Record<B0Role, { background: string; border: string; text: string; accent: string }> = {
  customer: {
    background: "rgba(255, 250, 240, 0.88)",
    border: "rgba(255, 255, 255, 0.88)",
    text: "#2b2118",
    accent: "#b85f2a",
  },
  worker: {
    background: "rgba(32, 58, 91, 0.88)",
    border: "rgba(184, 200, 220, 0.34)",
    text: "#f8fbff",
    accent: "#2f9bff",
  },
  admin: {
    background: "rgba(56, 45, 70, 0.9)",
    border: "rgba(207, 196, 219, 0.3)",
    text: "#fffaff",
    accent: "#8554c7",
  },
  neutral: {
    background: "rgba(255, 255, 255, 0.9)",
    border: "rgba(255, 255, 255, 0.88)",
    text: "#111827",
    accent: "#2563eb",
  },
};

function mergeStyle(base: CSSProperties, override?: CSSProperties): CSSProperties {
  return { ...base, ...override };
}

export interface LiquidGlassSurfaceProps extends HTMLAttributes<HTMLDivElement> {
  purpose?: LiquidGlassPurpose;
  visualRole?: B0Role;
}

/**
 * Functional glass layer for navigation, controls and overlays.
 * The opaque fallback remains readable when backdrop-filter is unavailable.
 */
export function LiquidGlassSurface({
  purpose = "control",
  visualRole = "neutral",
  style,
  children,
  ...props
}: LiquidGlassSurfaceProps) {
  const role = roleFallbacks[visualRole];
  const radius = purpose === "navigation" ? "var(--xlb-radius-xxl, 28px)" : "var(--xlb-radius-xl, 24px)";
  return (
    <div
      {...props}
      data-liquid-glass={purpose}
      data-visual-role={visualRole}
      style={mergeStyle(
        {
          WebkitBackdropFilter: "blur(var(--xlb-glass-backdrop-blur, 18px)) saturate(var(--xlb-glass-saturation, 140%))",
          backdropFilter: "blur(var(--xlb-glass-backdrop-blur, 18px)) saturate(var(--xlb-glass-saturation, 140%))",
          background: role.background,
          border: `var(--xlb-stroke-hairline, 1px) solid ${role.border}`,
          borderRadius: radius,
          boxShadow:
            "inset 0 0 0 var(--xlb-stroke-hairline, 1px) var(--xlb-glass-inner-stroke, rgba(255,255,255,.42)), var(--xlb-glass-ambient-shadow, 0 20px 60px rgba(15,23,42,.12))",
          boxSizing: "border-box",
          color: role.text,
          isolation: "isolate",
        },
        style,
      )}
    >
      {children}
    </div>
  );
}

export type AppleServiceCardProps = ServiceCardProps;

/** Apple-style service hierarchy backed by the existing ServiceCard contract. */
export function AppleServiceCard({ style, ...props }: AppleServiceCardProps) {
  return (
    <ServiceCard
      {...props}
      data-service-card="apple"
      style={mergeStyle(
        {
          background: "rgba(255, 250, 240, 0.94)",
          border: "var(--xlb-stroke-hairline, 1px) solid var(--xlb-glass-edge-highlight, rgba(255,255,255,.88))",
          borderRadius: "var(--xlb-radius-xl, 24px)",
          boxShadow:
            "inset 0 0 0 var(--xlb-stroke-hairline, 1px) var(--xlb-glass-inner-stroke, rgba(255,255,255,.42)), 0 16px 38px rgba(43,33,24,.10)",
          minHeight: 132,
          padding: "var(--xlb-spacing-lg, 24px)",
        },
        style,
      )}
    />
  );
}

export interface IdentityGateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  visualRole: Exclude<B0Role, "neutral">;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  form: ReactNode;
  actions: ReactNode;
  recoveryTarget?: ReactNode;
  notice?: ReactNode;
  error?: ReactNode;
}

/** Visual-only identity gate. Authentication state and submit actions stay with the app. */
export function IdentityGate({
  visualRole,
  title,
  description,
  status,
  form,
  actions,
  recoveryTarget,
  notice,
  error,
  style,
  ...props
}: IdentityGateProps) {
  const gateBackgrounds: Record<Exclude<B0Role, "neutral">, string> = {
    customer:
      "radial-gradient(circle at 18% 12%, rgba(255,255,255,.96), transparent 34%), radial-gradient(circle at 82% 78%, rgba(236,170,103,.16), transparent 36%), var(--xlb-role-customer-cream, #fffaf0)",
    worker:
      "radial-gradient(circle at 82% 18%, rgba(47,155,255,.16), transparent 34%), var(--xlb-role-worker-page, #08172b)",
    admin:
      "radial-gradient(circle at 78% 16%, rgba(133,84,199,.18), transparent 36%), var(--xlb-role-admin-page, #191225)",
  };

  return (
    <section
      {...props}
      data-b0-gate="identity"
      data-visual-role={visualRole}
      style={mergeStyle(
        {
          alignItems: "center",
          background: gateBackgrounds[visualRole],
          boxSizing: "border-box",
          display: "grid",
          minHeight: "100dvh",
          padding: "var(--xlb-spacing-lg, 24px)",
        },
        style,
      )}
    >
      <LiquidGlassSurface
        purpose="overlay"
        visualRole={visualRole}
        style={{ display: "grid", gap: 20, margin: "0 auto", maxWidth: 440, padding: 24, width: "100%" }}
      >
        <header style={{ display: "grid", gap: 8 }}>
          {status ? <div style={{ justifySelf: "start" }}>{status}</div> : null}
          <h1 style={{ fontSize: 24, lineHeight: "32px", margin: 0 }}>{title}</h1>
          {description ? <p style={{ margin: 0, opacity: 0.78 }}>{description}</p> : null}
          {recoveryTarget ? (
            <p data-gate-recovery-target style={{ fontSize: 13, margin: 0, opacity: 0.72 }}>
              {recoveryTarget}
            </p>
          ) : null}
        </header>
        <div style={{ display: "grid", gap: 12 }}>{form}</div>
        {notice ? (
          <div role="status" style={{ color: "var(--xlb-color-success, #16794f)", fontSize: 13 }}>
            {notice}
          </div>
        ) : null}
        {error ? (
          <div role="alert" style={{ color: "var(--xlb-color-danger, #b91c1c)", fontSize: 13 }}>
            {error}
          </div>
        ) : null}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div>
      </LiquidGlassSurface>
    </section>
  );
}

export interface CityScopeGateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  title?: ReactNode;
  description?: ReactNode;
  currentScope?: ReactNode;
  selector: ReactNode;
  actions: ReactNode;
  recoveryTarget?: ReactNode;
}

export function CityScopeGate({
  title = "选择工作城市",
  description,
  currentScope,
  selector,
  actions,
  recoveryTarget,
  style,
  ...props
}: CityScopeGateProps) {
  return (
    <section
      {...props}
      data-b0-gate="city-scope"
      style={mergeStyle(
        {
          alignItems: "center",
          background: "var(--xlb-role-admin-page, #191225)",
          boxSizing: "border-box",
          color: "var(--xlb-role-admin-text, #fffaff)",
          display: "grid",
          minHeight: "100dvh",
          padding: "var(--xlb-spacing-lg, 24px)",
        },
        style,
      )}
    >
      <LiquidGlassSurface purpose="overlay" visualRole="admin" style={{ display: "grid", gap: 16, margin: "0 auto", maxWidth: 520, padding: 24, width: "100%" }}>
        <header style={{ display: "grid", gap: 8 }}>
          <h1 style={{ fontSize: 24, lineHeight: "32px", margin: 0 }}>{title}</h1>
          {description ? <p style={{ margin: 0, opacity: 0.78 }}>{description}</p> : null}
          {currentScope ? <div style={{ fontSize: 13, opacity: 0.76 }}>{currentScope}</div> : null}
          {recoveryTarget ? <div data-gate-recovery-target style={{ fontSize: 13, opacity: 0.72 }}>{recoveryTarget}</div> : null}
        </header>
        <div>{selector}</div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>{actions}</div>
      </LiquidGlassSurface>
    </section>
  );
}

export type OperationalStateKind =
  | "permission"
  | "conflict"
  | "offline"
  | "duplicate"
  | "partial"
  | "handoff"
  | "result";

export interface OperationalStateProps extends Omit<HTMLAttributes<HTMLElement>, "title"> {
  kind: OperationalStateKind;
  title: ReactNode;
  description?: ReactNode;
  facts?: ReactNode;
  action?: ReactNode;
  secondaryAction?: ReactNode;
  referenceId?: ReactNode;
  live?: "polite" | "assertive" | "off";
}

const stateTone: Record<OperationalStateKind, { accent: string; background: string }> = {
  permission: { accent: "#b91c1c", background: "#fef2f2" },
  conflict: { accent: "#b45309", background: "#fffbeb" },
  offline: { accent: "#475569", background: "#f8fafc" },
  duplicate: { accent: "#2563eb", background: "#eff6ff" },
  partial: { accent: "#b45309", background: "#fffbeb" },
  handoff: { accent: "#8554c7", background: "#f6f3fb" },
  result: { accent: "#047857", background: "#ecfdf5" },
};

export function OperationalState({
  kind,
  title,
  description,
  facts,
  action,
  secondaryAction,
  referenceId,
  live = "polite",
  style,
  ...props
}: OperationalStateProps) {
  const tone = stateTone[kind];
  return (
    <section
      {...props}
      aria-live={live}
      data-operational-state={kind}
      style={mergeStyle(
        {
          background: tone.background,
          border: `1px solid color-mix(in srgb, ${tone.accent} 34%, transparent)`,
          borderInlineStart: `4px solid ${tone.accent}`,
          borderRadius: "var(--xlb-radius-lg, 16px)",
          boxSizing: "border-box",
          color: "var(--xlb-text-primary, #111827)",
          display: "grid",
          gap: 12,
          padding: "var(--xlb-spacing-lg, 24px)",
        },
        style,
      )}
    >
      <div style={{ display: "grid", gap: 6 }}>
        <strong style={{ color: tone.accent, fontSize: 16, lineHeight: "24px" }}>{title}</strong>
        {description ? <div style={{ fontSize: 14, lineHeight: "22px" }}>{description}</div> : null}
      </div>
      {facts ? <div data-state-facts style={{ fontSize: 13, lineHeight: "20px" }}>{facts}</div> : null}
      {referenceId ? <div data-state-reference style={{ fontFamily: "var(--xlb-font-family-mono, monospace)", fontSize: 12 }}>{referenceId}</div> : null}
      {action || secondaryAction ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </section>
  );
}

type NamedStateProps = Omit<OperationalStateProps, "kind">;

export function PermissionState(props: NamedStateProps) {
  return <OperationalState kind="permission" live="assertive" {...props} />;
}

export function ConflictState(props: NamedStateProps) {
  return <OperationalState kind="conflict" live="assertive" {...props} />;
}

export function OfflineState(props: NamedStateProps) {
  return <OperationalState kind="offline" {...props} />;
}

export function DuplicateState(props: NamedStateProps) {
  return <OperationalState kind="duplicate" {...props} />;
}

export function PartialResultState(props: NamedStateProps) {
  return <OperationalState kind="partial" {...props} />;
}

export function HandoffState(props: NamedStateProps) {
  return <OperationalState kind="handoff" {...props} />;
}

export interface PersistentResultStateProps extends NamedStateProps {
  status: "unknown" | "processing" | "success" | "failure";
}

export function PersistentResultState({ status, ...props }: PersistentResultStateProps) {
  return <OperationalState data-result-status={status} kind="result" {...props} />;
}
