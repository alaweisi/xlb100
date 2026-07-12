import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const source = (path: string) => readFileSync(join(root, path), "utf8");

describe("Phase 25 Gate 1B material-recipe boundaries", () => {
  it("passes the executable source, recipe, readiness, and scope gate", () => {
    const output = execFileSync("node", ["scripts/check-phase25-gate1b.mjs"], {
      cwd: root,
      encoding: "utf8",
    });

    expect(output).toContain("[phase25-gate1b] PASS");
  }, 15_000);

  it("keeps Apps, backend, database, API client, non-token UI, and migration 054 blocked", () => {
    const gate = source("scripts/check-phase25-gate1b.mjs");
    for (const boundary of [
      '"apps/"',
      '"backend/"',
      '"db/"',
      '"packages/api-client/"',
      '"packages/ui/src/"',
      '"packages/ui/src/tokens/"',
      "migration 054",
    ]) {
      expect(gate).toContain(boundary);
    }
  });

  it("blocks Gate 1C App integration and preserves OA/Dashboard readiness", () => {
    const gate = source("scripts/check-phase25-gate1b.mjs");
    for (const marker of [
      "ThemeProvider",
      "RuntimeThemeEnvelope",
      "resolveThemeTokens",
      "OA recipe must remain readiness blocked",
      "Dashboard recipe must remain readiness blocked",
    ]) {
      expect(gate).toContain(marker);
    }
  });

  it("rejects raw colors in all three recipe sources", () => {
    const gate = source("scripts/check-phase25-gate1b.mjs");
    for (const recipe of [
      "customerMaterialRecipe.ts",
      "roleMaterialRecipes.ts",
      "runtimeCapabilityRecipes.ts",
      "rawColorPattern",
    ]) {
      expect(gate).toContain(recipe);
    }
  });
});
