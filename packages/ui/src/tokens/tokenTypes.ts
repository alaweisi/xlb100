import type { CSSProperties, ReactNode } from "react";

export type ThemeTokenPrimitive = string | number;

/** Backwards-compatible readonly token tree used by CSS-variable consumers. */
export interface ThemeTokenTree {
  readonly [key: string]: ThemeTokenPrimitive | ThemeTokenTree;
}

export type ThemeTokens = ThemeTokenTree;
export type ThemeTokenOverrides = ThemeTokenTree;

export type ThemeTokenLayerId = "L0" | "L1" | "L2" | "L3" | "L4" | "L5" | "L6" | "L7";
export type ThemeRole = "customer" | "worker" | "admin" | "oa" | "dashboard";
export type ThemeMode = "light" | "dark" | "high-contrast" | "large-display";
export type RegisteredThemeId = "default" | "spring-festival" | "double11";

export interface ThemeTokenLayerDefinition {
  readonly id: ThemeTokenLayerId;
  readonly name: string;
  readonly owner: "ui" | "resolver" | "campaign-bridge" | "component" | "runtime";
  readonly mayOverrideProtectedSemantics: boolean;
}

export interface ThemeRoleDefinition {
  readonly id: ThemeRole;
  readonly label: string;
}

export interface ThemeModeDefinition {
  readonly id: ThemeMode;
  readonly label: string;
}

export type MaterialRecipeId =
  | "customer-liquid-glass"
  | "worker-operational-dark"
  | "admin-dense-operations"
  | "oa-readiness"
  | "dashboard-readiness";

export type MaterialDensity = "comfortable" | "compact" | "dense" | "wallboard";
export type MaterialCapability =
  | "backdrop-filter"
  | "forced-colors"
  | "reduced-motion"
  | "low-power"
  | "large-display";

export interface MaterialRecipe {
  readonly id: MaterialRecipeId;
  readonly role: ThemeRole;
  readonly sourceAuthority: string;
  readonly readiness: "ready" | "blocked";
  readonly density: MaterialDensity;
  readonly viewportToken: string;
  readonly surfaceTokens: readonly string[];
  readonly borderTokens: readonly string[];
  readonly typographyTokens: readonly string[];
  readonly layoutTokens: readonly string[];
  readonly protectedSemanticTokens: readonly string[];
  readonly supportedCapabilities: readonly MaterialCapability[];
  readonly fallbackRecipeIds: readonly RuntimeCapabilityRecipeId[];
}

export type RuntimeCapabilityRecipeId =
  | "no-backdrop-filter"
  | "forced-colors"
  | "reduced-motion"
  | "low-power";

export interface RuntimeCapabilityRecipe {
  readonly id: RuntimeCapabilityRecipeId;
  readonly trigger: string;
  readonly overrideTokenRefs: Readonly<Record<string, string>>;
  readonly invariants: readonly string[];
}

export interface ThemeDefinition {
  readonly id: RegisteredThemeId;
  readonly label: string;
  readonly tokens: ThemeTokenOverrides;
}

export interface ResolvedTheme {
  readonly requestedThemeId: string;
  readonly resolvedThemeId: RegisteredThemeId;
  readonly tokens: ThemeTokens;
  readonly fallbackUsed: boolean;
  readonly rejectedOverridePaths: readonly string[];
}

export interface CampaignThemeMergeResult {
  readonly tokens: ThemeTokens;
  readonly appliedOverridePaths: readonly string[];
  readonly rejectedOverridePaths: readonly string[];
}

export interface ThemeProviderProps {
  children: ReactNode;
  className?: string;
  themeId?: RegisteredThemeId | string;
  resolvedTokens?: ThemeTokens;
  /** Required when resolvedTokens did not come from resolveTheme. */
  resolvedThemeId?: RegisteredThemeId;
  style?: CSSProperties;
}

export interface RuntimeThemeCapabilities {
  readonly backdropFilter: boolean;
  readonly forcedColors: boolean;
  readonly reducedMotion: boolean;
  readonly lowPower: boolean;
}

export interface RuntimeThemeScope {
  readonly role: ThemeRole;
  readonly mode: ThemeMode;
  readonly cityCode: string;
  readonly routeScope: string | null;
}
