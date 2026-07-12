import { describe, expect, it, vi } from "vitest";
import type { RuntimeThemeEnvelope } from "@xlb/types";
import { resolveCampaignPresentation, runtimeThemeGalleryScenarios } from "@xlb/ui";

const envelope: RuntimeThemeEnvelope = {
  schemaVersion: "1.0", revision: "theme:1", resolvedThemeId: "spring-festival", role: "customer", mode: "light",
  cityCode: "hangzhou", campaignId: "spring-2027", campaignRevision: "campaign:1", cityScopeProof: "proof",
  routeScope: "/customer", placementScope: ["banner"], tokenOverrides: {}, effectiveAt: "2027-01-01T00:00:00.000Z",
  expiresAt: "2027-02-01T00:00:00.000Z", cacheTtlSeconds: 60, resolutionReason: "campaign-active",
  killSwitchActive: false, fallbackThemeId: "default",
  presentation: { revision: "presentation:1", locale: "zh-CN", blessingCopy: null, placements: [{ placement: "banner", headline: "已批准的展示", body: null, badgeLabel: null, assetId: "banner", cta: { label: "查看", actionKey: "open-campaign" } }] },
  assetManifest: { revision: "assets:1", sourcePolicy: { kind: "same-origin", pathPrefix: "/assets/campaign/" }, assets: [{ id: "banner", revision: "asset:1", src: "/assets/campaign/banner.webp", mimeType: "image/webp", widthPx: 640, heightPx: 320, byteSize: 100, maxBytes: 1024, integrity: "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=", decorative: true, altText: null, pointerEvents: "none", zIndex: 0, preloadPriority: "low", responsiveSources: [], fallbackAssetId: null }] },
};

describe("Phase 25 Gate 1D presentation slots", () => {
  it("renders only scoped, manifest-backed assets and allowlisted CTA keys", () => {
    const action = vi.fn();
    const [slot] = resolveCampaignPresentation(envelope, { "open-campaign": action });
    expect(slot).toMatchObject({ placement: "banner", asset: { src: "/assets/campaign/banner.webp" }, cta: { actionKey: "open-campaign" } });
  });

  it("fails decorative presentation closed when an action or asset source is unsafe", () => {
    const unsafe = { ...envelope, assetManifest: { ...envelope.assetManifest!, assets: [{ ...envelope.assetManifest!.assets[0], src: "javascript:alert(1)" }] } };
    const [slot] = resolveCampaignPresentation(unsafe, {});
    expect(slot.asset).toBeNull();
    expect(slot.cta).toBeNull();
  });
});

describe("Phase 25 Gate 1F gallery matrix", () => {
  it("covers all five roles and accessibility/runtime fallback evidence", () => {
    expect(new Set(runtimeThemeGalleryScenarios.map((scenario) => scenario.role))).toEqual(new Set(["customer", "worker", "admin", "oa", "dashboard"]));
    expect(runtimeThemeGalleryScenarios.some((scenario) => scenario.capabilities.forcedColors && scenario.capabilities.reducedMotion)).toBe(true);
    expect(runtimeThemeGalleryScenarios.some((scenario) => scenario.state === "asset-fallback")).toBe(true);
  });
});
