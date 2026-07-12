import type { CSSProperties, ReactNode } from "react";
import type { ThemeMode, ThemeRole } from "../tokens/tokenTypes.js";

export interface SemanticShellProps {
  readonly role: ThemeRole;
  readonly mode: ThemeMode;
  readonly children: ReactNode;
  readonly header?: ReactNode;
  readonly navigation?: ReactNode;
  readonly footer?: ReactNode;
  readonly style?: CSSProperties;
}

/** Shared visual-only shell. It deliberately owns no route, workflow state, or API action. */
export function SemanticShell({ role, mode, children, header, navigation, footer, style }: SemanticShellProps) {
  return (
    <div
      data-ui-mode={mode}
      data-ui-role={role}
      style={{
        background: "var(--xlb-surface-page)",
        color: "var(--xlb-text-primary)",
        display: "grid",
        fontFamily: "var(--xlb-typography-font-family)",
        gridTemplateRows: `${header ? "auto " : ""}1fr${footer ? " auto" : ""}`,
        minHeight: "100dvh",
        ...style,
      }}
    >
      {header}
      <div style={{ display: "grid", gridTemplateColumns: navigation ? "auto minmax(0, 1fr)" : "minmax(0, 1fr)", minWidth: 0 }}>
        {navigation}
        <main style={{ minWidth: 0 }}>{children}</main>
      </div>
      {footer}
    </div>
  );
}
