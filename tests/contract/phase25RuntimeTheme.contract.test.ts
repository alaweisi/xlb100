import { describe, expect, it } from "vitest";
import {
  allowedCampaignTokenOverridesSchema,
  runtimeThemeAssetManifestSchema,
  runtimeThemeEnvelopeSchema,
} from "@xlb/validators";
import type { RuntimeThemeEnvelope, RuntimeThemeRole } from "@xlb/types";

const integrity = `sha256-${"A".repeat(43)}=`;

function validEnvelope(role: RuntimeThemeRole = "customer"): RuntimeThemeEnvelope {
  return {
    schemaVersion: "1.0",
    revision: "theme-rev:42",
    resolvedThemeId: "spring-festival",
    role,
    mode: role === "dashboard" ? "large-display" : "light",
    cityCode: "hangzhou",
    campaignId: "spring-2027",
    campaignRevision: "campaign-rev:8",
    cityScopeProof: "city-policy:hangzhou:8",
    routeScope: role === "customer" ? "/customer" : null,
    placementScope: ["banner"],
    tokenOverrides: {
      "campaign.accent": "#C9342FFF",
      "campaign.banner.background": "#FFF2DE",
      "campaign.decoration.intensity": 0.6,
    },
    presentation: {
      revision: "presentation:8",
      locale: "zh-CN",
      blessingCopy: "新春安心到家",
      placements: [{
        placement: "banner",
        headline: "新春服务保障",
        body: "优惠金额以服务报价结果为准",
        badgeLabel: "新春活动",
        assetId: "spring-banner",
        cta: { label: "查看服务", actionKey: "catalog.open" },
      }],
    },
    assetManifest: {
      revision: "assets:8",
      sourcePolicy: { kind: "same-origin", pathPrefix: "/theme-assets/" },
      assets: [{
        id: "spring-banner",
        revision: "asset:3",
        src: "/theme-assets/spring/banner.webp",
        mimeType: "image/webp",
        widthPx: 1200,
        heightPx: 480,
        byteSize: 120_000,
        maxBytes: 200_000,
        integrity,
        decorative: false,
        altText: "新春到家服务主题插画",
        pointerEvents: "none",
        zIndex: 0,
        preloadPriority: "high",
        responsiveSources: [{
          src: "/theme-assets/spring/banner-640.webp",
          widthPx: 640,
        }],
        fallbackAssetId: null,
      }],
    },
    effectiveAt: "2027-01-20T00:00:00.000Z",
    expiresAt: "2027-02-20T00:00:00.000Z",
    cacheTtlSeconds: 300,
    resolutionReason: "campaign-active",
    killSwitchActive: false,
    fallbackThemeId: "default",
  };
}

describe("Phase 25 runtime theme contract", () => {
  it.each<RuntimeThemeRole>(["customer", "worker", "admin", "oa", "dashboard"])(
    "accepts a strict resolved envelope for the %s system",
    (role) => {
      expect(runtimeThemeEnvelopeSchema.safeParse(validEnvelope(role)).success).toBe(true);
    },
  );

  it("allows only the explicit visual L4 campaign token surface", () => {
    expect(allowedCampaignTokenOverridesSchema.safeParse({
      "campaign.accent": "#C9342F",
      "campaign.decoration.opacity": 0.5,
    }).success).toBe(true);

    expect(allowedCampaignTokenOverridesSchema.safeParse({
      "status.danger": "#00FF00",
    }).success).toBe(false);
    expect(allowedCampaignTokenOverridesSchema.safeParse({
      "campaign.banner.background": "var(--remote-color)",
    }).success).toBe(false);
    expect(allowedCampaignTokenOverridesSchema.safeParse({
      "campaign.accent": "url(javascript:alert(1))",
    }).success).toBe(false);
  });

  it("enforces same-origin and HTTPS allowlisted asset policies", () => {
    const sameOrigin = validEnvelope().assetManifest!;
    expect(runtimeThemeAssetManifestSchema.safeParse(sameOrigin).success).toBe(true);

    expect(runtimeThemeAssetManifestSchema.safeParse({
      ...sameOrigin,
      assets: [{ ...sameOrigin.assets[0], src: "https://untrusted.example/banner.webp" }],
    }).success).toBe(false);

    const httpsManifest = {
      ...sameOrigin,
      sourcePolicy: {
        kind: "https-allowlisted" as const,
        allowedOrigins: ["https://static.xlb.example"],
      },
      assets: [{
        ...sameOrigin.assets[0],
        src: "https://static.xlb.example/theme/banner.webp",
        responsiveSources: [],
      }],
    };
    expect(runtimeThemeAssetManifestSchema.safeParse(httpsManifest).success).toBe(true);
    expect(runtimeThemeAssetManifestSchema.safeParse({
      ...httpsManifest,
      assets: [{ ...httpsManifest.assets[0], src: "http://static.xlb.example/theme/banner.webp" }],
    }).success).toBe(false);
  });

  it("requires an application actionKey and rejects URL-driven CTAs", () => {
    const envelope = validEnvelope();
    envelope.presentation!.placements[0]!.cta = {
      label: "立即查看",
      actionKey: "https://evil.example/redirect",
    };
    expect(runtimeThemeEnvelopeSchema.safeParse(envelope).success).toBe(false);
  });

  it("rejects out-of-scope routes, placements, assets, and excessive TTL", () => {
    const badRoute = validEnvelope();
    badRoute.routeScope = "https://evil.example/customer";
    expect(runtimeThemeEnvelopeSchema.safeParse(badRoute).success).toBe(false);

    const badPlacement = validEnvelope();
    badPlacement.placementScope = ["badge"];
    expect(runtimeThemeEnvelopeSchema.safeParse(badPlacement).success).toBe(false);

    const missingAsset = validEnvelope();
    missingAsset.presentation!.placements[0]!.assetId = "not-in-manifest";
    expect(runtimeThemeEnvelopeSchema.safeParse(missingAsset).success).toBe(false);

    const excessiveTtl = validEnvelope();
    excessiveTtl.cacheTtlSeconds = 3601;
    expect(runtimeThemeEnvelopeSchema.safeParse(excessiveTtl).success).toBe(false);
  });

  it("requires kill switch responses to be a clean default fallback", () => {
    const fallback: RuntimeThemeEnvelope = {
      ...validEnvelope(),
      resolvedThemeId: "default",
      campaignId: null,
      campaignRevision: null,
      placementScope: [],
      tokenOverrides: {},
      presentation: null,
      assetManifest: null,
      resolutionReason: "default-kill-switch",
      killSwitchActive: true,
      expiresAt: null,
      cacheTtlSeconds: 0,
    };
    expect(runtimeThemeEnvelopeSchema.safeParse(fallback).success).toBe(true);

    expect(runtimeThemeEnvelopeSchema.safeParse({
      ...fallback,
      tokenOverrides: { "campaign.accent": "#C9342F" },
    }).success).toBe(false);
    expect(runtimeThemeEnvelopeSchema.safeParse({
      ...fallback,
      cacheTtlSeconds: 60,
    }).success).toBe(false);
  });

  it("does not permit fallback reasons to carry campaign presentation", () => {
    expect(runtimeThemeEnvelopeSchema.safeParse({
      ...validEnvelope(),
      resolutionReason: "default-expired",
    }).success).toBe(false);
  });

  it("rejects replay-prone revision mismatch and unknown envelope fields", () => {
    const missingRevision = validEnvelope();
    missingRevision.campaignRevision = null;
    expect(runtimeThemeEnvelopeSchema.safeParse(missingRevision).success).toBe(false);

    expect(runtimeThemeEnvelopeSchema.safeParse({
      ...validEnvelope(),
      apiUrl: "https://evil.example",
    }).success).toBe(false);
  });
});
