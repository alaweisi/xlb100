import { type CSSProperties, type ReactNode } from "react";

export interface UiTemplateRuntimeBinding {
  actor: "customer" | "worker" | "admin";
  runtimeThemeTokens: {
    activeThemeId: string;
    affects: "visual-only";
  };
}

export interface WorkerTemplateShellProps {
  cityCode: string;
  binding: UiTemplateRuntimeBinding;
  children: ReactNode;
  header?: ReactNode;
  actions?: ReactNode;
  style?: CSSProperties;
}
