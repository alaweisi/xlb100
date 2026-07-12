import { baseTokens } from "./base/defaultTokens.js";
import { runtimeCapabilityRecipes } from "./recipes/runtimeCapabilityRecipes.js";
import { mergeCampaignThemeTokens, mergeThemeTokens, resolveTheme } from "./themeRegistry.js";
import type {
  RuntimeCapabilityRecipeId,
  RuntimeThemeCapabilities,
  RuntimeThemeScope,
  ThemeTokenOverrides,
  ThemeTokens,
} from "./tokenTypes.js";

export type RuntimeThemeFallbackReason =
  | "invalid-envelope"
  | "scope-mismatch"
  | "expired"
  | "unknown-theme"
  | "kill-switch";

interface RuntimeThemeEnvelopeLike {
  readonly revision: string;
  readonly resolvedThemeId: string;
  readonly role: string;
  readonly mode: string;
  readonly cityCode: string;
  readonly routeScope: string | null;
  readonly tokenOverrides: ThemeTokenOverrides;
  readonly expiresAt: string | null;
  readonly killSwitchActive: boolean;
}

export interface RuntimeThemeEnvelopeValidator {
  safeParse(candidate: unknown):
    | { success: true; data: RuntimeThemeEnvelopeLike }
    | { success: false };
}

export interface ResolvedRuntimeTheme {
  readonly tokens: ThemeTokens;
  readonly themeId: string;
  readonly revision: string | null;
  readonly fallbackReason: RuntimeThemeFallbackReason | null;
  readonly appliedCapabilityRecipes: readonly RuntimeCapabilityRecipeId[];
}

function readPath(tokens: ThemeTokens, path: string): string | number | undefined {
  return path.split(".").reduce<string | number | ThemeTokens | undefined>((value, segment) => {
    if (typeof value !== "object" || value === null) return undefined;
    return value[segment];
  }, tokens) as string | number | undefined;
}

function overrideAtPath(path: string, value: string | number): ThemeTokenOverrides {
  const root: Record<string, unknown> = Object.create(null);
  let cursor = root;
  const segments = path.split(".");
  for (const segment of segments.slice(0, -1)) {
    const child: Record<string, unknown> = Object.create(null);
    cursor[segment] = child;
    cursor = child;
  }
  cursor[segments.at(-1)!] = value;
  return root as ThemeTokenOverrides;
}

function capabilityRecipeIds(capabilities: RuntimeThemeCapabilities): RuntimeCapabilityRecipeId[] {
  const active: RuntimeCapabilityRecipeId[] = [];
  if (!capabilities.backdropFilter) active.push("no-backdrop-filter");
  if (capabilities.forcedColors) active.push("forced-colors");
  if (capabilities.reducedMotion) active.push("reduced-motion");
  if (capabilities.lowPower) active.push("low-power");
  return active;
}

function applyCapabilityRecipes(tokens: ThemeTokens, capabilities: RuntimeThemeCapabilities): {
  tokens: ThemeTokens;
  ids: RuntimeCapabilityRecipeId[];
} {
  const ids = capabilityRecipeIds(capabilities);
  let resolved = tokens;
  for (const id of ids) {
    for (const [target, reference] of Object.entries(runtimeCapabilityRecipes[id].overrideTokenRefs)) {
      const value = readPath(resolved, reference);
      if (value !== undefined) resolved = mergeThemeTokens(resolved, overrideAtPath(target, value));
    }
  }
  return { tokens: resolved, ids };
}

function fallback(
  reason: RuntimeThemeFallbackReason,
  capabilities: RuntimeThemeCapabilities,
): ResolvedRuntimeTheme {
  const applied = applyCapabilityRecipes(baseTokens, capabilities);
  return Object.freeze({
    tokens: applied.tokens,
    themeId: "default",
    revision: null,
    fallbackReason: reason,
    appliedCapabilityRecipes: Object.freeze(applied.ids),
  });
}

/**
 * Pure Gate 1C resolver. It performs no I/O and never makes campaign, price,
 * city, permission, or workflow decisions; callers only supply an already
 * resolved envelope from an approved source.
 */
export function resolveRuntimeTheme(
  candidate: unknown,
  scope: RuntimeThemeScope,
  capabilities: RuntimeThemeCapabilities,
  validator: RuntimeThemeEnvelopeValidator,
  now = new Date(),
): ResolvedRuntimeTheme {
  const parsed = validator.safeParse(candidate);
  if (!parsed.success) return fallback("invalid-envelope", capabilities);
  const envelope = parsed.data;
  if (envelope.killSwitchActive) return fallback("kill-switch", capabilities);
  if (envelope.role !== scope.role || envelope.mode !== scope.mode || envelope.cityCode !== scope.cityCode ||
      envelope.routeScope !== null && envelope.routeScope !== scope.routeScope) {
    return fallback("scope-mismatch", capabilities);
  }
  if (envelope.expiresAt !== null && Date.parse(envelope.expiresAt) <= now.getTime()) {
    return fallback("expired", capabilities);
  }
  const registered = resolveTheme(envelope.resolvedThemeId);
  if (registered.fallbackUsed) return fallback("unknown-theme", capabilities);
  const campaign = mergeCampaignThemeTokens(registered.tokens, envelope.tokenOverrides);
  if (campaign.rejectedOverridePaths.length > 0) return fallback("invalid-envelope", capabilities);
  const applied = applyCapabilityRecipes(campaign.tokens, capabilities);
  return Object.freeze({
    tokens: applied.tokens,
    themeId: registered.resolvedThemeId,
    revision: envelope.revision,
    fallbackReason: null,
    appliedCapabilityRecipes: Object.freeze(applied.ids),
  });
}

export interface RuntimeThemeLoadResult {
  readonly candidate: unknown;
}

export type RuntimeThemeLoader = (scope: RuntimeThemeScope) => Promise<RuntimeThemeLoadResult>;

/**
 * App-agnostic bridge state: latest scope wins, commits are atomic, and stale
 * async results are discarded. Network/API wiring remains outside Gate 1C.
 */
export class RuntimeThemeBridge {
  #generation = 0;
  #resolved: ResolvedRuntimeTheme | null = null;

  constructor(private readonly validator: RuntimeThemeEnvelopeValidator) {}

  get snapshot(): ResolvedRuntimeTheme | null {
    return this.#resolved;
  }

  async refresh(
    loader: RuntimeThemeLoader,
    scope: RuntimeThemeScope,
    capabilities: RuntimeThemeCapabilities,
    now = new Date(),
  ): Promise<ResolvedRuntimeTheme> {
    const generation = ++this.#generation;
    const result = await loader(scope);
    const resolved = resolveRuntimeTheme(result.candidate, scope, capabilities, this.validator, now);
    if (generation === this.#generation) this.#resolved = resolved;
    return generation === this.#generation ? resolved : this.#resolved ?? resolved;
  }

  invalidate(): void {
    this.#generation += 1;
    this.#resolved = null;
  }
}
