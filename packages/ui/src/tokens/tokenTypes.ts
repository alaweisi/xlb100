import type { CSSProperties, ReactNode } from "react";

export type ThemeTokenPrimitive = string | number;

export interface ThemeTokenTree {
  readonly [key: string]: ThemeTokenPrimitive | ThemeTokenTree;
}

export type ThemeTokens = ThemeTokenTree;
export type ThemeTokenOverrides = ThemeTokenTree;
export type RegisteredThemeId = "default" | "spring-festival" | "double11";

export interface ThemeDefinition {
  id: RegisteredThemeId;
  label: string;
  tokens: ThemeTokenOverrides;
}

export interface ThemeProviderProps {
  children: ReactNode;
  className?: string;
  themeId?: RegisteredThemeId | string;
  resolvedTokens?: ThemeTokens;
  style?: CSSProperties;
}
