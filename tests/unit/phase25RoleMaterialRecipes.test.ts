import { describe, expect, it } from "vitest";
import {
  adminDenseOperationsRecipe,
  baseTokens,
  dashboardReadinessRecipe,
  oaReadinessRecipe,
  PROTECTED_THEME_TOKEN_PATHS,
  roleMaterialRecipes,
  workerOperationalDarkRecipe,
} from "@xlb/ui";

function resolveTokenPath(path: string): unknown {
  return path.split(".").reduce<unknown>((cursor, segment) => {
    if (typeof cursor !== "object" || cursor === null || !Object.prototype.hasOwnProperty.call(cursor, segment)) {
      return undefined;
    }
    return (cursor as Record<string, unknown>)[segment];
  }, baseTokens);
}

function tokenRefs(recipe: (typeof roleMaterialRecipes)[keyof typeof roleMaterialRecipes]): string[] {
  return [
    recipe.viewportToken,
    ...recipe.surfaceTokens,
    ...recipe.borderTokens,
    ...recipe.typographyTokens,
    ...recipe.layoutTokens,
    ...recipe.protectedSemanticTokens,
    ...recipe.priorityTokenRefs,
  ];
}

describe("Phase 25 Gate 1B Worker/Admin role material recipes", () => {
  it("grounds Worker in the archived GrabHall source and prioritizes outdoor readability", () => {
    expect(workerOperationalDarkRecipe).toMatchObject({
      role: "worker",
      readiness: "ready",
      density: "comfortable",
      viewportToken: "breakpoint.compact",
      sourceAuthority: "docs/design/figma/frames/worker/worker_grabhall_online_1-1515.png",
    });
    expect(workerOperationalDarkRecipe.priorityTokenRefs).toEqual(expect.arrayContaining([
      "role.worker.text",
      "role.worker.muted",
      "font.weight.bold",
      "size.touchTarget",
      "color.warning",
      "color.danger",
      "state.stale",
    ]));
    expect(workerOperationalDarkRecipe.layoutTokens).toEqual(expect.arrayContaining([
      "size.bottomNavigation",
      "safeArea.bottomNavigation",
      "breakpoint.medium",
    ]));
  });

  it("grounds Admin in the archived Dashboard source and keeps desktop operations dense", () => {
    expect(adminDenseOperationsRecipe).toMatchObject({
      role: "admin",
      readiness: "ready",
      density: "dense",
      viewportToken: "breakpoint.wide",
      sourceAuthority: "docs/design/figma/frames/admin/admin_dashboard_default_1-2875.png",
    });
    expect(adminDenseOperationsRecipe.layoutTokens).toEqual(expect.arrayContaining([
      "grid.columnsWide",
      "grid.gutterWide",
      "grid.maxContent",
      "size.controlSm",
      "zIndex.overlay",
      "zIndex.modal",
    ]));
    expect(adminDenseOperationsRecipe.priorityTokenRefs).toEqual(expect.arrayContaining([
      "font.numeric",
      "font.lineHeight.tight",
      "border.focus",
      "color.danger",
      "state.stale",
    ]));
  });

  it("keeps OA and Dashboard blocked until standalone sources and runtime contracts exist", () => {
    expect(oaReadinessRecipe.readiness).toBe("blocked");
    expect(dashboardReadinessRecipe.readiness).toBe("blocked");
    expect(oaReadinessRecipe.sourceAuthority).toBe("docs/design/figma/manifest.json#/exportUnavailable/2");
    expect(dashboardReadinessRecipe.sourceAuthority).toBe("docs/design/figma/manifest.json#/exportUnavailable/1");
    expect(tokenRefs(oaReadinessRecipe).some((path) => path.startsWith("role.oa."))).toBe(false);
    expect(tokenRefs(dashboardReadinessRecipe).some((path) => path.startsWith("role.dashboard."))).toBe(false);
  });

  it("reserves chart, alert, freshness, and numeric hierarchy for the future Dashboard contract", () => {
    expect(dashboardReadinessRecipe).toMatchObject({
      density: "wallboard",
      viewportToken: "breakpoint.wallboard",
    });
    expect(dashboardReadinessRecipe.priorityTokenRefs).toEqual(expect.arrayContaining([
      "chart.axis",
      "chart.grid",
      "chart.threshold",
      "chart.positive",
      "chart.negative",
      "state.stale",
      "color.warning",
      "color.danger",
      "font.numeric",
      "font.size.display",
    ]));
  });

  it("references only paths that exist in the canonical token source", () => {
    for (const recipe of Object.values(roleMaterialRecipes)) {
      expect(Object.isFrozen(recipe), recipe.id).toBe(true);
      const unresolved = tokenRefs(recipe).filter((path) => resolveTokenPath(path) === undefined);
      expect(unresolved, recipe.id).toEqual([]);
    }
  });

  it("lists only protected semantics from the frozen protected-token registry", () => {
    const protectedPaths = new Set<string>(PROTECTED_THEME_TOKEN_PATHS);
    for (const recipe of Object.values(roleMaterialRecipes)) {
      expect(
        recipe.protectedSemanticTokens.filter((path) => !protectedPaths.has(path)),
        recipe.id,
      ).toEqual([]);
    }
  });
});
