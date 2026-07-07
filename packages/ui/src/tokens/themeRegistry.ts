import { baseTokens } from "./base/defaultTokens.js";
import {
  defaultThemeTokens,
  double11ThemeTokens,
  springFestivalThemeTokens,
} from "./themes/themeDefinitions.js";
import type {
  RegisteredThemeId,
  ThemeDefinition,
  ThemeTokenOverrides,
  ThemeTokens,
} from "./tokenTypes.js";

export const defaultThemeId = "default" as const;

export const themeRegistry: Record<RegisteredThemeId, ThemeDefinition> = {
  default: {
    id: "default",
    label: "Default",
    tokens: defaultThemeTokens,
  },
  "spring-festival": {
    id: "spring-festival",
    label: "Spring Festival",
    tokens: springFestivalThemeTokens,
  },
  double11: {
    id: "double11",
    label: "Double 11",
    tokens: double11ThemeTokens,
  },
};

function isTokenTree(value: unknown): value is ThemeTokens {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function mergeThemeTokens(
  base: ThemeTokens,
  override?: ThemeTokenOverrides,
): ThemeTokens {
  if (!override) return base;

  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const baseValue = base[key];
    if (isTokenTree(baseValue) && isTokenTree(value)) {
      merged[key] = mergeThemeTokens(baseValue, value);
    } else {
      merged[key] = value;
    }
  }

  return merged as ThemeTokens;
}

export function resolveThemeTokens(themeId: string = defaultThemeId): ThemeTokens {
  const registeredTheme = themeRegistry[themeId as RegisteredThemeId] ?? themeRegistry.default;
  const withDefault = mergeThemeTokens(baseTokens, themeRegistry.default.tokens);
  return mergeThemeTokens(withDefault, registeredTheme.tokens);
}
