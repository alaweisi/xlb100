import { baseTokens } from "./base/defaultTokens.js";
import {
  defaultThemeTokens,
  double11ThemeTokens,
  springFestivalThemeTokens,
} from "./themes/themeDefinitions.js";
import type {
  CampaignThemeMergeResult,
  RegisteredThemeId,
  ResolvedTheme,
  ThemeDefinition,
  ThemeTokenOverrides,
  ThemeTokenPrimitive,
  ThemeTokens,
} from "./tokenTypes.js";

export const defaultThemeId = "default" as const;

export const PROTECTED_THEME_TOKEN_PATHS = [
  "border.focus", "shadow.focus", "text.onDanger", "text.onWarning", "text.onSuccess",
  "color.info", "color.success", "color.warning", "color.danger",
  "state.selectedRing", "state.loading", "state.success", "state.warning", "state.error", "state.stale",
  "chart.axis", "chart.grid", "chart.threshold", "chart.positive", "chart.negative",
] as const;

export const ALLOWED_CAMPAIGN_TOKEN_PATHS = [
  "campaign.accent", "campaign.ambient",
  "campaign.banner.background", "campaign.banner.text",
  "campaign.badge.background", "campaign.badge.text",
  "campaign.decoration.opacity", "campaign.decoration.intensity",
  "campaign.navigation.accent",
] as const;

export type ProtectedThemeTokenPath = typeof PROTECTED_THEME_TOKEN_PATHS[number];
export type AllowedCampaignTokenPath = typeof ALLOWED_CAMPAIGN_TOKEN_PATHS[number];
export interface AllowedCampaignTokenOverrides {
  "campaign.accent"?: string;
  "campaign.ambient"?: string;
  "campaign.banner.background"?: string;
  "campaign.banner.text"?: string;
  "campaign.badge.background"?: string;
  "campaign.badge.text"?: string;
  "campaign.decoration.opacity"?: number;
  "campaign.decoration.intensity"?: number;
  "campaign.navigation.accent"?: string;
}

const protectedPaths = new Set<string>(PROTECTED_THEME_TOKEN_PATHS);
const allowedCampaignPaths = new Set<string>(ALLOWED_CAMPAIGN_TOKEN_PATHS);
const forbiddenKeys = new Set(["__proto__", "prototype", "constructor"]);
const unsafeCssValue = /(?:url|var|expression)\s*\(|<\/?(?:script|style)|javascript:|data:/i;
const campaignColorValue = /^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/i;

export const themeRegistry: Readonly<Record<RegisteredThemeId, ThemeDefinition>> = Object.freeze({
  default: { id: "default", label: "Default", tokens: defaultThemeTokens },
  "spring-festival": { id: "spring-festival", label: "Spring Festival", tokens: springFestivalThemeTokens },
  double11: { id: "double11", label: "Double 11", tokens: double11ThemeTokens },
});

function isTokenTree(value: unknown): value is ThemeTokens {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSafePrimitive(value: unknown): value is ThemeTokenPrimitive {
  if (typeof value === "number") return Number.isFinite(value);
  return typeof value === "string" && value.length <= 512 && !unsafeCssValue.test(value);
}

function isSafeCampaignValue(path: string, value: unknown): value is ThemeTokenPrimitive {
  if (path === "campaign.decoration.opacity" || path === "campaign.decoration.intensity") {
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  }
  return typeof value === "string" && campaignColorValue.test(value) && isSafePrimitive(value);
}

function hasOwn(object: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

/** Prototype-safe compatibility merge. Unknown paths and unsafe values are ignored. */
export function mergeThemeTokens(base: ThemeTokens, override?: ThemeTokenOverrides): ThemeTokens {
  if (!override) return base;
  const merged: Record<string, ThemeTokenPrimitive | ThemeTokens> = Object.create(null);

  for (const [key, baseValue] of Object.entries(base)) {
    if (forbiddenKeys.has(key)) continue;
    const overrideValue = hasOwn(override, key) ? override[key] : undefined;
    if (isTokenTree(baseValue)) {
      merged[key] = isTokenTree(overrideValue) ? mergeThemeTokens(baseValue, overrideValue) : baseValue;
    } else {
      merged[key] = isSafePrimitive(overrideValue) ? overrideValue : baseValue;
    }
  }
  return merged;
}

function flattenOverrides(tree: ThemeTokenOverrides, path: string[] = [], output: Record<string, unknown> = Object.create(null)): Record<string, unknown> {
  for (const [key, value] of Object.entries(tree)) {
    if (forbiddenKeys.has(key)) {
      output[[...path, key].join(".")] = value;
      continue;
    }
    const nextPath = [...path, key];
    if (isTokenTree(value)) flattenOverrides(value, nextPath, output);
    else output[nextPath.join(".")] = value;
  }
  return output;
}

function assignPath(target: ThemeTokens, path: string, value: ThemeTokenPrimitive): ThemeTokens {
  const segments = path.split(".");
  const nested: Record<string, unknown> = Object.create(null);
  let cursor = nested;
  for (let index = 0; index < segments.length - 1; index += 1) {
    const child: Record<string, unknown> = Object.create(null);
    cursor[segments[index]!] = child;
    cursor = child;
  }
  cursor[segments.at(-1)!] = value;
  return mergeThemeTokens(target, nested as ThemeTokenOverrides);
}

export function isProtectedThemeTokenPath(path: string): path is ProtectedThemeTokenPath {
  return protectedPaths.has(path);
}

/** Strict L4 merge: only approved visual paths with safe primitives can land. */
export function mergeCampaignThemeTokens(
  base: ThemeTokens,
  override?: ThemeTokenOverrides | AllowedCampaignTokenOverrides,
): CampaignThemeMergeResult {
  if (!override) return { tokens: base, appliedOverridePaths: [], rejectedOverridePaths: [] };
  const flat = flattenOverrides(override as ThemeTokenOverrides);
  const appliedOverridePaths: string[] = [];
  const rejectedOverridePaths: string[] = [];
  let tokens = base;

  for (const [path, value] of Object.entries(flat)) {
    if (!allowedCampaignPaths.has(path) || protectedPaths.has(path) || !isSafeCampaignValue(path, value)) {
      rejectedOverridePaths.push(path);
      continue;
    }
    tokens = assignPath(tokens, path, value);
    appliedOverridePaths.push(path);
  }
  return { tokens, appliedOverridePaths, rejectedOverridePaths };
}

export function resolveRegisteredThemeId(themeId: string = defaultThemeId): RegisteredThemeId {
  return hasOwn(themeRegistry, themeId) ? themeId as RegisteredThemeId : defaultThemeId;
}

export function resolveTheme(themeId: string = defaultThemeId): ResolvedTheme {
  const resolvedThemeId = resolveRegisteredThemeId(themeId);
  const definition = themeRegistry[resolvedThemeId];
  const campaignMerge = resolvedThemeId === defaultThemeId
    ? { tokens: baseTokens, appliedOverridePaths: [], rejectedOverridePaths: [] }
    : mergeCampaignThemeTokens(baseTokens, definition.tokens);
  return {
    requestedThemeId: themeId,
    resolvedThemeId,
    tokens: campaignMerge.tokens,
    fallbackUsed: themeId !== resolvedThemeId,
    rejectedOverridePaths: campaignMerge.rejectedOverridePaths,
  };
}

export function resolveThemeTokens(themeId: string = defaultThemeId): ThemeTokens {
  return resolveTheme(themeId).tokens;
}
