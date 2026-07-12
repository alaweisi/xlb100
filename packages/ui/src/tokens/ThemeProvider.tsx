import type { CSSProperties } from "react";
import { mergeThemeTokens, resolveTheme } from "./themeRegistry.js";
import { baseTokens } from "./base/defaultTokens.js";
import type { ThemeProviderProps, ThemeTokenPrimitive, ThemeTokens } from "./tokenTypes.js";

function toCssVariableName(path: string[]): string {
  return `--xlb-${path
    .join("-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()}`;
}

function collectCssVariables(
  tokens: ThemeTokens,
  path: string[] = [],
  output: Record<string, ThemeTokenPrimitive> = {},
): Record<string, ThemeTokenPrimitive> {
  for (const [key, value] of Object.entries(tokens)) {
    const nextPath = [...path, key];
    if (typeof value === "string" || typeof value === "number") {
      output[toCssVariableName(nextPath)] = value;
    } else {
      collectCssVariables(value, nextPath, output);
    }
  }

  return output;
}

export function createThemeStyle(tokens: ThemeTokens): CSSProperties {
  return collectCssVariables(mergeThemeTokens(baseTokens, tokens)) as CSSProperties;
}

export function ThemeProvider({
  children,
  className,
  themeId = "default",
  resolvedTokens,
  resolvedThemeId,
  style,
}: ThemeProviderProps) {
  const resolution = resolveTheme(themeId);
  const effectiveThemeId = resolvedTokens
    ? (resolvedThemeId ?? resolution.resolvedThemeId)
    : resolution.resolvedThemeId;
  const tokens = resolvedTokens ?? resolution.tokens;
  return (
    <div
      className={className}
      data-theme-id={effectiveThemeId}
      data-theme-requested-id={themeId === effectiveThemeId ? undefined : themeId}
      style={{ ...createThemeStyle(tokens), ...style }}
    >
      {children}
    </div>
  );
}
