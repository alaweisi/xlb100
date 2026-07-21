import { describe, expect, it } from "vitest";
import {
  ALLOWED_CAMPAIGN_TOKEN_PATHS,
  baseTokens,
  CANONICAL_TOKEN_SOURCE,
  createThemeStyle,
  isProtectedThemeTokenPath,
  mergeCampaignThemeTokens,
  mergeThemeTokens,
  modeThemeDefinitions,
  PROTECTED_THEME_TOKEN_PATHS,
  resolveTheme,
  resolveThemeTokens,
  roleThemeDefinitions,
  TOKEN_LAYER_TAXONOMY,
  TOKEN_SCHEMA_VERSION,
} from "@xlb/ui";
import type { ThemeTokenOverrides } from "@xlb/ui";
import { RUNTIME_CAMPAIGN_TOKEN_PATHS } from "@xlb/types";

describe("Phase 25 Gate 1A token contract", () => {
  it("freezes one canonical source and the complete L0-L7 taxonomy", () => {
    expect(CANONICAL_TOKEN_SOURCE).toBe("packages/ui/src/tokens/base/defaultTokens.ts");
    expect(TOKEN_SCHEMA_VERSION).toBe("25.5.0");
    expect(TOKEN_LAYER_TAXONOMY.map((layer) => layer.id)).toEqual([
      "L0", "L1", "L2", "L3", "L4", "L5", "L6", "L7",
    ]);
    expect(TOKEN_LAYER_TAXONOMY.find((layer) => layer.id === "L4")?.mayOverrideProtectedSemantics).toBe(false);
  });

  it("defines all five role identities and four runtime modes without page recipes", () => {
    expect(Object.keys(roleThemeDefinitions)).toEqual(["customer", "worker", "admin", "oa", "dashboard"]);
    expect(Object.keys(modeThemeDefinitions)).toEqual(["light", "dark", "high-contrast", "large-display"]);
  });

  it("keeps safety and workflow-status semantics outside the Campaign L4 allowlist", () => {
    expect(PROTECTED_THEME_TOKEN_PATHS).toContain("border.focus");
    expect(PROTECTED_THEME_TOKEN_PATHS).toContain("color.danger");
    expect(PROTECTED_THEME_TOKEN_PATHS).toContain("chart.threshold");
    expect(ALLOWED_CAMPAIGN_TOKEN_PATHS).not.toContain("border.focus");
    expect(ALLOWED_CAMPAIGN_TOKEN_PATHS).not.toContain("color.brand");
    expect(ALLOWED_CAMPAIGN_TOKEN_PATHS).not.toContain("color.danger");
    expect(ALLOWED_CAMPAIGN_TOKEN_PATHS).toEqual(RUNTIME_CAMPAIGN_TOKEN_PATHS);
    expect(isProtectedThemeTokenPath("state.error")).toBe(true);
    expect(isProtectedThemeTokenPath("campaign.accent")).toBe(false);
  });

  it("applies only safe allowlisted Campaign values without mutating its base", () => {
    const originalBrand = baseTokens.color.brand;
    const result = mergeCampaignThemeTokens(baseTokens, {
      color: { brand: "#991b1b", danger: "#000000" },
      border: { focus: "#000000" },
      campaign: { accent: "#991b1b", decoration: { intensity: 0.75 } },
    });

    expect(result.tokens.color.brand).toBe(baseTokens.color.brand);
    expect(result.tokens.color.danger).toBe(baseTokens.color.danger);
    expect(result.tokens.border.focus).toBe(baseTokens.border.focus);
    expect(result.tokens.campaign.accent).toBe("#991b1b");
    expect(result.tokens.campaign.decoration.intensity).toBe(0.75);
    expect(result.appliedOverridePaths).toEqual(["campaign.accent", "campaign.decoration.intensity"]);
    expect(result.rejectedOverridePaths).toEqual(["color.brand", "color.danger", "border.focus"]);
    expect(baseTokens.color.brand).toBe(originalBrand);
  });

  it("rejects CSS injection, unknown paths, non-finite values, and prototype keys", () => {
    const hostile = JSON.parse(`{
      "color":{"brand":"url(javascript:alert(1))"},
      "surface":{"page":"var(--attacker)"},
      "campaign":{"badge":{"background":"<script>alert(1)</script>"},"decoration":{"opacity":1.5,"intensity":1e999}},
      "unknown":{"token":"#fff"},
      "__proto__":{"polluted":"yes"}
    }`) as ThemeTokenOverrides;
    const result = mergeCampaignThemeTokens(baseTokens, hostile);

    expect(result.appliedOverridePaths).toEqual([]);
    expect(result.rejectedOverridePaths).toEqual(expect.arrayContaining([
      "color.brand", "surface.page", "campaign.badge.background", "campaign.decoration.opacity",
      "campaign.decoration.intensity",
      "unknown.token", "__proto__",
    ]));
    expect(({} as { polluted?: string }).polluted).toBeUndefined();
  });

  it("uses the actual resolved id and default tokens for an unknown requested theme", () => {
    const resolution = resolveTheme("remote-untrusted-theme");
    expect(resolution).toMatchObject({
      requestedThemeId: "remote-untrusted-theme",
      resolvedThemeId: "default",
      fallbackUsed: true,
    });
    expect(resolution.tokens.color.brand).toBe(baseTokens.color.brand);
    expect(resolveThemeTokens("remote-untrusted-theme")).toEqual(resolveThemeTokens("default"));
  });

  it("resolves registered campaigns through the L4 safety merge", () => {
    const spring = resolveTheme("spring-festival");
    expect(spring.resolvedThemeId).toBe("spring-festival");
    expect(spring.fallbackUsed).toBe(false);
    expect(spring.tokens.campaign.accent).toBe("#c2410c");
    expect(spring.tokens.color.brand).toBe(baseTokens.color.brand);
    expect(spring.tokens.border.focus).toBe(baseTokens.border.focus);
    expect(spring.rejectedOverridePaths).toEqual([]);
  });

  it("keeps the compatibility merge closed to unknown and unsafe values", () => {
    const merged = mergeThemeTokens(baseTokens, {
      color: { brand: "expression(alert(1))", invented: "#fff" },
      inventedDomain: { value: "#fff" },
    });
    expect(merged.color.brand).toBe(baseTokens.color.brand);
    expect(merged.color.invented).toBeUndefined();
    expect(merged.inventedDomain).toBeUndefined();
  });

  it("derives deterministic CSS variables from the validated canonical shape", () => {
    const style = createThemeStyle(resolveThemeTokens("double11")) as Record<string, string | number>;
    expect(style["--xlb-color-brand"]).toBe(baseTokens.color.brand);
    expect(style["--xlb-border-focus"]).toBe(baseTokens.border.focus);
    expect(style["--xlb-campaign-decoration-intensity"]).toBe(1);
    expect(style["--xlb-font-size-caption"]).toBe("13px");
    expect(style["--xlb-measure-rem34"]).toBe("34rem");
    expect(style["--xlb-z-index-above"]).toBe(1);
    expect(Object.keys(style).some((key) => key.includes("__proto__"))).toBe(false);
  });
});
