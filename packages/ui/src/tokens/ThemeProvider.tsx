import type { CSSProperties } from "react";
import { resolveThemeTokens } from "./themeRegistry.js";
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
  return collectCssVariables(tokens) as CSSProperties;
}

export function ThemeProvider({
  children,
  className,
  themeId = "default",
  resolvedTokens,
  style,
}: ThemeProviderProps) {
  const tokens = resolvedTokens ?? resolveThemeTokens(themeId);
  return (
    <div
      className={className}
      data-theme-id={themeId}
      style={{ ...createThemeStyle(tokens), ...style }}
    >
      {children}
    </div>
  );
}
