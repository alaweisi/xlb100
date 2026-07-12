import { describe, expect, it } from "vitest";
import {
  baseTokens,
  forcedColorsCapabilityRecipe,
  lowPowerCapabilityRecipe,
  noBackdropFilterCapabilityRecipe,
  reducedMotionCapabilityRecipe,
  runtimeCapabilityRecipes,
} from "@xlb/ui";

const CANONICAL_TOKEN_REFERENCE = /^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)+$/;
const FORBIDDEN_WORKFLOW_TARGET = /^(?:state\.(?:loading|success|warning|error|stale)|color\.(?:success|warning|danger)|border\.focus|chart\.(?:threshold|positive|negative))$/;

function collectPrimitivePaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) =>
    collectPrimitivePaths(child, prefix ? `${prefix}.${key}` : key),
  );
}

const canonicalPrimitivePaths = new Set(collectPrimitivePaths(baseTokens));

describe("Phase 25 Gate 1B runtime capability recipes", () => {
  it("freezes exactly the four L7 fallback recipes", () => {
    expect(Object.keys(runtimeCapabilityRecipes)).toEqual([
      "no-backdrop-filter",
      "forced-colors",
      "reduced-motion",
      "low-power",
    ]);
    expect(Object.isFrozen(runtimeCapabilityRecipes)).toBe(true);

    for (const recipe of Object.values(runtimeCapabilityRecipes)) {
      expect(Object.isFrozen(recipe)).toBe(true);
      expect(Object.isFrozen(recipe.overrideTokenRefs)).toBe(true);
      expect(Object.isFrozen(recipe.invariants)).toBe(true);
      expect(recipe.invariants).toEqual(expect.arrayContaining([
        "workflow-state-is-authoritative",
        "permission-city-audit-and-idempotency-semantics-are-unchanged",
        "focus-status-and-dashboard-alert-semantics-remain-protected",
      ]));
    }
  });

  it("uses only canonical token references and never overrides protected workflow semantics", () => {
    for (const recipe of Object.values(runtimeCapabilityRecipes)) {
      for (const [target, reference] of Object.entries(recipe.overrideTokenRefs)) {
        expect(target).toMatch(CANONICAL_TOKEN_REFERENCE);
        expect(reference).toMatch(CANONICAL_TOKEN_REFERENCE);
        expect(canonicalPrimitivePaths.has(target), `unknown override target ${target}`).toBe(true);
        expect(canonicalPrimitivePaths.has(reference), `unknown token reference ${reference}`).toBe(true);
        expect(target).not.toMatch(FORBIDDEN_WORKFLOW_TARGET);
      }
    }
  });

  it("provides an opaque material when backdrop filtering is unavailable", () => {
    expect(noBackdropFilterCapabilityRecipe.overrideTokenRefs).toMatchObject({
      "surface.glass": "surface.panel",
      "glass.tint": "surface.panel",
      "glass.backdropBlur": "blur.none",
    });
  });

  it("lets forced-colors remove decorative glass and campaign dependence", () => {
    expect(forcedColorsCapabilityRecipe.overrideTokenRefs).toMatchObject({
      "surface.glass": "surface.panel",
      "glass.backdropBlur": "blur.none",
      "campaign.banner.text": "text.primary",
    });
    expect(forcedColorsCapabilityRecipe.invariants).toContain(
      "information-is-never-conveyed-by-color-alone",
    );
  });

  it("eliminates non-essential motion without altering state or focus", () => {
    expect(reducedMotionCapabilityRecipe.overrideTokenRefs).toMatchObject({
      "motion.duration.fast": "motion.duration.instant",
      "motion.duration.slow": "motion.duration.instant",
      "motion.distance.md": "motion.distance.none",
    });
  });

  it("reduces persistent visual work while preserving realtime truth", () => {
    expect(lowPowerCapabilityRecipe.overrideTokenRefs).toMatchObject({
      "glass.backdropBlur": "blur.none",
      "shadow.ambient": "shadow.sm",
      "motion.duration.slow": "motion.duration.fast",
    });
    expect(lowPowerCapabilityRecipe.invariants).toContain(
      "realtime-freshness-and-disconnection-indicators-remain-visible",
    );
  });
});
