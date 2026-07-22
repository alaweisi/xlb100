// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BrandLogo, BrandLogoProvider } from "@xlb/customer-components";
import type { RuntimeThemeEnvelope } from "@xlb/types";
import { runtimeThemeEnvelopeSchema } from "@xlb/validators";
import type { RuntimeThemeCapabilities, RuntimeThemeScope } from "@xlb/ui";
import {
  CUSTOMER_BRAND_LOGO_ASSET_ID,
  CustomerAssetRuntime,
  CustomerPresentationProvider,
  resolveCustomerPresentation,
  type CustomerPresentationEnvelope,
  type CustomerPresentationEnvelopeValidator,
  type CustomerRuntimeAssetManifest,
} from "../../packages/customer-components/src/presentation/index.js";

const scope: RuntimeThemeScope = {
  role: "customer",
  mode: "light",
  cityCode: "hangzhou",
  routeScope: "/customer",
};

const capabilities: RuntimeThemeCapabilities = {
  backdropFilter: true,
  forcedColors: false,
  reducedMotion: false,
  lowPower: false,
};

const acceptedIntegrity = "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

function assetManifest(): CustomerRuntimeAssetManifest {
  return {
    revision: "brand-assets:1",
    sourcePolicy: { kind: "same-origin", pathPrefix: "/assets/brand/" },
    assets: [
      {
        id: CUSTOMER_BRAND_LOGO_ASSET_ID,
        revision: "logo:1",
        src: "/assets/brand/logo.png",
        mimeType: "image/png",
        widthPx: 160,
        heightPx: 48,
        byteSize: 4,
        maxBytes: 1_024,
        integrity: acceptedIntegrity,
        decorative: false,
        altText: "喜乐帮",
        preloadPriority: "high",
        fallbackAssetId: null,
      },
    ],
  };
}

function envelope(manifest: CustomerRuntimeAssetManifest | null = null): CustomerPresentationEnvelope {
  return {
    revision: "customer-theme:1",
    resolvedThemeId: "default",
    role: "customer",
    mode: "light",
    cityCode: "hangzhou",
    routeScope: "/customer",
    tokenOverrides: { "campaign.accent": "#006B68" },
    expiresAt: "2026-08-23T00:00:00.000Z",
    killSwitchActive: false,
    assetManifest: manifest,
  };
}

function validatorFor(accepted: CustomerPresentationEnvelope): CustomerPresentationEnvelopeValidator {
  return {
    safeParse(candidate: unknown) {
      return candidate === accepted
        ? { success: true as const, data: accepted }
        : { success: false as const };
    },
  };
}

describe("Customer P7 presentation runtime", () => {
  it("accepts the authoritative shared runtime-theme validator", () => {
    const candidate: RuntimeThemeEnvelope = {
      schemaVersion: "1.0",
      revision: "customer-theme:shared:1",
      resolvedThemeId: "default",
      role: "customer",
      mode: "light",
      cityCode: "hangzhou",
      campaignId: "customer-campaign",
      campaignRevision: "campaign:1",
      cityScopeProof: "customer:hangzhou",
      routeScope: "/customer",
      placementScope: [],
      tokenOverrides: { "campaign.accent": "#006B68" },
      presentation: null,
      assetManifest: null,
      effectiveAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-08-23T00:00:00.000Z",
      cacheTtlSeconds: 300,
      resolutionReason: "campaign-active",
      killSwitchActive: false,
      fallbackThemeId: "default",
    };

    const resolved = resolveCustomerPresentation(
      candidate,
      scope,
      capabilities,
      runtimeThemeEnvelopeSchema,
      new Date("2026-07-23T00:00:00.000Z"),
    );
    expect(resolved.fallbackReason).toBeNull();
    expect(resolved.tokens.campaign?.accent).toBe("#006B68");
  });

  it("keeps the approved Customer foundation while applying the allowed runtime delta", () => {
    const candidate = envelope();
    const resolved = resolveCustomerPresentation(
      candidate,
      scope,
      capabilities,
      validatorFor(candidate),
      new Date("2026-07-23T00:00:00.000Z"),
    );

    expect(resolved.fallbackReason).toBeNull();
    expect(resolved.tokens.surface?.page).toBe("#CFEFEF");
    expect(resolved.tokens.color?.accent).toBe("#FF6A00");
    expect(resolved.tokens.campaign?.accent).toBe("#006B68");
    expect(resolved.tokens.border?.focus).toBe("#FF6A00");
  });

  it("fails closed to the Customer foundation when the envelope is rejected", () => {
    const candidate = envelope();
    const resolved = resolveCustomerPresentation(
      { ...candidate, resolvedThemeId: "unknown" },
      scope,
      capabilities,
      validatorFor(candidate),
    );

    expect(resolved.fallbackReason).toBe("invalid-envelope");
    expect(resolved.envelope).toBeNull();
    expect(resolved.tokens.surface?.page).toBe("#CFEFEF");
    expect(resolved.tokens.campaign?.accent).not.toBe("#006B68");
  });

  it("verifies bytes and follows the declared asset fallback chain", async () => {
    const manifest = assetManifest();
    const primary = manifest.assets[0]!;
    const fallback = {
      ...primary,
      id: "customer.brand.logo.fallback",
      revision: "logo:fallback:1",
      src: "/assets/brand/logo-fallback.png",
      integrity: acceptedIntegrity,
      fallbackAssetId: null,
    };
    const runtime = new CustomerAssetRuntime({
      ...manifest,
      assets: [
        { ...primary, integrity: "sha256-BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB=", fallbackAssetId: fallback.id },
        fallback,
      ],
    }, {
      fetcher: vi.fn(async () => new Response(new Uint8Array([1, 2, 3, 4]), {
        status: 200,
        headers: { "content-type": "image/png" },
      })),
      digestSha256: vi.fn(async () => acceptedIntegrity),
      createObjectUrl: vi.fn(() => "blob:verified-logo"),
      revokeObjectUrl: vi.fn(),
      now: () => new Date("2026-07-23T00:00:00.000Z"),
    });

    const loaded = await runtime.load(CUSTOMER_BRAND_LOGO_ASSET_ID);
    expect(loaded).toMatchObject({
      asset: { id: fallback.id },
      verifiedSrc: "blob:verified-logo",
      sourceSrc: fallback.src,
    });
  });

  it("hot-swaps the verified logo and preserves xlb100 during loading", async () => {
    const candidate = envelope(assetManifest());
    const stateChanges: string[] = [];
    const revokeObjectUrl = vi.fn();

    render(
      <CustomerPresentationProvider
        candidate={candidate}
        scope={scope}
        capabilities={capabilities}
        validator={validatorFor(candidate)}
        nowDate={new Date("2026-07-23T00:00:00.000Z")}
        fetcher={async () => new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "image/png" },
        })}
        digestSha256={async () => acceptedIntegrity}
        createObjectUrl={() => "blob:verified-brand"}
        revokeObjectUrl={revokeObjectUrl}
        onBrandAssetStateChange={(state) => stateChanges.push(state)}
      >
        <BrandLogo />
      </CustomerPresentationProvider>,
    );

    expect(screen.getByRole("img", { name: "xlb100" }).textContent).toContain("xlb100");
    await waitFor(() => {
      expect(screen.getByRole("img", { name: "喜乐帮" }).querySelector("img")?.getAttribute("src"))
        .toBe("blob:verified-brand");
    });
    expect(stateChanges).toEqual(expect.arrayContaining(["loading", "ready"]));
  });

  it("recovers from an old image failure when a new logo revision arrives", async () => {
    const { rerender } = render(
      <BrandLogoProvider value={{
        kind: "image",
        src: "/assets/brand/logo-v1.png",
        accessibleName: "喜乐帮",
        fallbackText: "xlb100",
      }}>
        <BrandLogo />
      </BrandLogoProvider>,
    );
    fireEvent.error(screen.getByRole("img", { name: "喜乐帮" }).querySelector("img")!);
    expect(screen.getByRole("img", { name: "喜乐帮" }).textContent).toContain("xlb100");

    rerender(
      <BrandLogoProvider value={{
        kind: "image",
        src: "/assets/brand/logo-v2.png",
        accessibleName: "喜乐帮新版",
        fallbackText: "xlb100",
      }}>
        <BrandLogo />
      </BrandLogoProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("img", { name: "喜乐帮新版" }).querySelector("img")?.getAttribute("src"))
        .toBe("/assets/brand/logo-v2.png");
    });
  });
});
