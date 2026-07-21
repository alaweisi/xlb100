import { describe, expect, it } from "vitest";
import { baseTokens, customerLiquidGlassMaterialRecipe, PROTECTED_THEME_TOKEN_PATHS } from "@xlb/ui";

function hasCanonicalTokenPath(path: string): boolean {
  let cursor: unknown = baseTokens;
  for (const segment of path.split(".")) {
    if (typeof cursor !== "object" || cursor === null || !(segment in cursor)) return false;
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  return typeof cursor === "string" || typeof cursor === "number";
}

describe("Phase 25 Customer material recipe", () => {
  it("is grounded in the locked Customer Home visual truth", () => {
    expect(Object.isFrozen(customerLiquidGlassMaterialRecipe)).toBe(true);
    expect(customerLiquidGlassMaterialRecipe).toMatchObject({
      id: "customer-liquid-glass",
      role: "customer",
      readiness: "ready",
      density: "comfortable",
      viewportToken: "breakpoint.compact",
      sourceAuthority: "docs/design/ui/references/customer-home-visual-truth.png",
    });
  });

  it("references only canonical primitive token paths", () => {
    const references = [
      customerLiquidGlassMaterialRecipe.viewportToken,
      ...customerLiquidGlassMaterialRecipe.surfaceTokens,
      ...customerLiquidGlassMaterialRecipe.borderTokens,
      ...customerLiquidGlassMaterialRecipe.typographyTokens,
      ...customerLiquidGlassMaterialRecipe.layoutTokens,
      ...customerLiquidGlassMaterialRecipe.protectedSemanticTokens,
    ];

    expect(references.every(hasCanonicalTokenPath)).toBe(true);
    expect(new Set(references).size).toBe(references.length);
  });

  it("preserves protected semantics and declares every required runtime fallback", () => {
    expect(customerLiquidGlassMaterialRecipe.protectedSemanticTokens.length).toBeGreaterThan(0);
    expect(customerLiquidGlassMaterialRecipe.protectedSemanticTokens.every((path) =>
      (PROTECTED_THEME_TOKEN_PATHS as readonly string[]).includes(path))).toBe(true);
    expect(customerLiquidGlassMaterialRecipe.fallbackRecipeIds).toEqual([
      "no-backdrop-filter",
      "forced-colors",
      "reduced-motion",
      "low-power",
    ]);
    expect(customerLiquidGlassMaterialRecipe.supportedCapabilities).toEqual([
      "backdrop-filter",
      "forced-colors",
      "reduced-motion",
      "low-power",
    ]);
  });

  it("contains visual references only, without business or route semantics", () => {
    const serialized = JSON.stringify(customerLiquidGlassMaterialRecipe).toLowerCase();
    for (const forbidden of [
      "order", "payment", "refund", "dispatch", "catalog", "quote", "price",
      "permission", "workflow", "api", "route", "citycode", "campaignid",
    ]) {
      expect(serialized).not.toMatch(new RegExp(`\\b${forbidden}\\b`));
    }
  });

  it("covers the source proportions, typography, warm ambience, glass edges and touch contract", () => {
    expect(customerLiquidGlassMaterialRecipe.layoutTokens).toEqual(expect.arrayContaining([
      "safeArea.bottomNavigation",
      "size.bottomNavigation",
      "size.touchTarget",
      "grid.columnsCompact",
    ]));
    expect(customerLiquidGlassMaterialRecipe.surfaceTokens).toEqual(expect.arrayContaining([
      "role.customer.ambient",
      "role.customer.glassTint",
      "glass.backdropBlur",
      "glass.ambientShadow",
    ]));
    expect(customerLiquidGlassMaterialRecipe.borderTokens).toEqual(expect.arrayContaining([
      "glass.edgeHighlight",
      "glass.innerStroke",
      "stroke.hairline",
      "stroke.regular",
    ]));
    expect(customerLiquidGlassMaterialRecipe.typographyTokens).toEqual(expect.arrayContaining([
      "font.familySans",
      "role.customer.ink",
    ]));
  });
});
