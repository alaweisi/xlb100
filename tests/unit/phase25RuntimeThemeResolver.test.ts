import { describe, expect, it } from "vitest";
import type { RuntimeThemeEnvelope } from "@xlb/types";
import { runtimeThemeEnvelopeSchema } from "@xlb/validators";
import { RuntimeThemeBridge, resolveRuntimeTheme } from "@xlb/ui";

const scope = { role: "customer", mode: "light", cityCode: "hangzhou", routeScope: "/customer" } as const;
const capabilities = { backdropFilter: true, forcedColors: false, reducedMotion: false, lowPower: false } as const;

function envelope(): RuntimeThemeEnvelope {
  return {
    schemaVersion: "1.0", revision: "theme:1", resolvedThemeId: "spring-festival", role: "customer", mode: "light", cityCode: "hangzhou", campaignId: "spring-2027", campaignRevision: "campaign:1", cityScopeProof: "proof:hangzhou", routeScope: "/customer", placementScope: [], tokenOverrides: { "campaign.accent": "#C9342F" }, presentation: null, assetManifest: null, effectiveAt: "2027-01-01T00:00:00.000Z", expiresAt: "2027-02-01T00:00:00.000Z", cacheTtlSeconds: 60, resolutionReason: "campaign-active", killSwitchActive: false, fallbackThemeId: "default",
  };
}

describe("Phase 25 Gate 1C runtime resolver and bridge", () => {
  it("resolves only a valid, current, scope-matched registered theme", () => {
    const resolved = resolveRuntimeTheme(envelope(), scope, capabilities, runtimeThemeEnvelopeSchema, new Date("2027-01-20T00:00:00Z"));
    expect(resolved).toMatchObject({ themeId: "spring-festival", revision: "theme:1", fallbackReason: null });
    expect(resolved.tokens.campaign.accent).toBe("#C9342F");
  });

  it.each([
    ["invalid-envelope", { ...envelope(), tokenOverrides: { "state.error": "#000000" } }, scope],
    ["scope-mismatch", envelope(), { ...scope, cityCode: "shanghai" }],
    ["expired", envelope(), scope],
    ["unknown-theme", { ...envelope(), resolvedThemeId: "unknown-theme" }, scope],
  ] as const)("falls back safely for %s", (reason, candidate, candidateScope) => {
    const now = reason === "expired" ? new Date("2027-03-01T00:00:00Z") : new Date("2027-01-20T00:00:00Z");
    expect(resolveRuntimeTheme(candidate, candidateScope, capabilities, runtimeThemeEnvelopeSchema, now)).toMatchObject({ themeId: "default", fallbackReason: reason });
  });

  it("applies capability recipes after the campaign layer without changing business state", () => {
    const resolved = resolveRuntimeTheme(envelope(), scope, { ...capabilities, backdropFilter: false, reducedMotion: true }, runtimeThemeEnvelopeSchema, new Date("2027-01-20T00:00:00Z"));
    expect(resolved.appliedCapabilityRecipes).toEqual(["no-backdrop-filter", "reduced-motion"]);
    expect(resolved.tokens.glass.backdropBlur).toBe("0");
    expect(resolved.tokens.motion.duration.slow).toBe("0ms");
    expect(resolved.tokens.state.error).toBe("#b91c1c");
  });

  it("atomically commits only the latest scope request", async () => {
    const bridge = new RuntimeThemeBridge(runtimeThemeEnvelopeSchema);
    let releaseFirst: ((value: { candidate: unknown }) => void) | undefined;
    const first = bridge.refresh(() => new Promise((resolve) => { releaseFirst = resolve; }), scope, capabilities);
    const second = bridge.refresh(async () => ({ candidate: { ...envelope(), revision: "theme:2" } }), scope, capabilities, new Date("2027-01-20T00:00:00Z"));
    await second;
    releaseFirst!({ candidate: envelope() });
    await first;
    expect(bridge.snapshot).toMatchObject({ revision: "theme:2" });
  });

  it("invalidates cached state on an identity or city boundary change", async () => {
    const bridge = new RuntimeThemeBridge(runtimeThemeEnvelopeSchema);
    await bridge.refresh(async () => ({ candidate: envelope() }), scope, capabilities, new Date("2027-01-20T00:00:00Z"));
    bridge.invalidate();
    expect(bridge.snapshot).toBeNull();
  });
});
