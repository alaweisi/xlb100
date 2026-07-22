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
  CustomerPresentationRuntime,
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
        pointerEvents: "none",
        zIndex: 0,
        preloadPriority: "high",
        responsiveSources: [],
        fallbackAssetId: null,
      },
    ],
  };
}

function envelope(manifest: CustomerRuntimeAssetManifest | null = null): CustomerPresentationEnvelope {
  return {
    schemaVersion: "1.0",
    revision: "customer-theme:1",
    resolvedThemeId: "default",
    role: "customer",
    mode: "light",
    cityCode: "hangzhou",
    campaignId: "customer-campaign",
    campaignRevision: "customer-campaign:1",
    cityScopeProof: "customer:hangzhou",
    routeScope: "/customer",
    placementScope: [],
    tokenOverrides: { "campaign.accent": "#006B68" },
    presentation: null,
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: "2026-08-23T00:00:00.000Z",
    cacheTtlSeconds: 300,
    resolutionReason: "campaign-active",
    killSwitchActive: false,
    assetManifest: manifest,
    fallbackThemeId: "default",
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

  it.each([
    ["not-effective", { effectiveAt: "2026-07-24T00:00:00.000Z" }],
    ["expired", { expiresAt: "2026-07-22T00:00:00.000Z" }],
    ["scope-mismatch", { cityCode: "shanghai" }],
  ] as const)("reports the %s presentation fallback", (reason, overrides) => {
    const candidate = { ...envelope(), ...overrides } as CustomerPresentationEnvelope;
    const resolved = resolveCustomerPresentation(
      candidate,
      scope,
      capabilities,
      validatorFor(candidate),
      new Date("2026-07-23T00:00:00.000Z"),
    );

    expect(resolved.fallbackReason).toBe(reason);
    expect(resolved.envelope).toBeNull();
    expect(resolved.tokens.surface?.page).toBe("#CFEFEF");
  });

  it("honors the kill switch instead of retaining a prior presentation", async () => {
    const active = envelope();
    const killed: CustomerPresentationEnvelope = {
      ...active,
      resolvedThemeId: "default",
      campaignId: null,
      campaignRevision: null,
      placementScope: [],
      tokenOverrides: {},
      presentation: null,
      assetManifest: null,
      expiresAt: null,
      cacheTtlSeconds: 0,
      resolutionReason: "default-kill-switch",
      killSwitchActive: true,
    };
    const runtime = new CustomerPresentationRuntime(runtimeThemeEnvelopeSchema);

    await runtime.refresh(async () => ({ candidate: active }), scope, capabilities,
      new Date("2026-07-23T00:00:00.000Z"));
    const result = await runtime.refresh(async () => ({ candidate: killed }), scope, capabilities,
      new Date("2026-07-23T00:00:00.000Z"));

    expect(result.status).toBe("fallback");
    expect(result.failureReason).toBe("kill-switch");
    expect(result.presentation?.envelope).toBeNull();
  });

  it("exposes loading and retains only a same-scope unexpired last-safe revision", async () => {
    const runtime = new CustomerPresentationRuntime(runtimeThemeEnvelopeSchema);
    const first = envelope();
    await runtime.refresh(async () => ({ candidate: first }), scope, capabilities,
      new Date("2026-07-23T00:00:00.000Z"));

    let release!: () => void;
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const refresh = runtime.refresh(async () => {
      await blocked;
      return { candidate: { invalid: true } };
    }, scope, capabilities, new Date("2026-07-23T00:00:00.000Z"));

    expect(runtime.snapshot.status).toBe("loading");
    expect(runtime.snapshot.presentation?.revision).toBe(first.revision);
    release();
    const result = await refresh;
    expect(result.status).toBe("last-safe");
    expect(result.failureReason).toBe("invalid-envelope");
    expect(result.presentation?.revision).toBe(first.revision);
  });

  it("commits only the latest asynchronous presentation refresh", async () => {
    const runtime = new CustomerPresentationRuntime(runtimeThemeEnvelopeSchema);
    const oldCandidate = envelope();
    const newCandidate = { ...envelope(), revision: "customer-theme:2" };
    let releaseOld!: () => void;
    const oldBlocked = new Promise<void>((resolve) => { releaseOld = resolve; });

    const oldRefresh = runtime.refresh(async () => {
      await oldBlocked;
      return { candidate: oldCandidate };
    }, scope, capabilities, new Date("2026-07-23T00:00:00.000Z"));
    const newRefresh = runtime.refresh(async () => ({ candidate: newCandidate }), scope, capabilities,
      new Date("2026-07-23T00:00:00.000Z"));

    await newRefresh;
    releaseOld();
    await oldRefresh;
    expect(runtime.snapshot.status).toBe("ready");
    expect(runtime.snapshot.presentation?.revision).toBe("customer-theme:2");
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

  it("reports asset failure and keeps the xlb100 fallback", async () => {
    const candidate = envelope(assetManifest());
    const stateChanges: string[] = [];

    render(
      <CustomerPresentationProvider
        candidate={candidate}
        scope={scope}
        capabilities={capabilities}
        validator={validatorFor(candidate)}
        fetcher={async () => new Response("not-an-image", {
          status: 200,
          headers: { "content-type": "text/html" },
        })}
        digestSha256={async () => acceptedIntegrity}
        createObjectUrl={() => "blob:must-not-be-used"}
        onBrandAssetStateChange={(state) => stateChanges.push(state)}
      >
        <BrandLogo />
      </CustomerPresentationProvider>,
    );

    await waitFor(() => expect(stateChanges.at(-1)).toBe("asset-failure"));
    expect(screen.getByRole("img", { name: "xlb100" }).textContent).toContain("xlb100");
  });

  it("rejects an asset source outside the shared manifest policy before fetching", async () => {
    const fetcher = vi.fn();
    const manifest = assetManifest();
    const runtime = new CustomerAssetRuntime({
      ...manifest,
      assets: [{ ...manifest.assets[0]!, src: "https://untrusted.example/logo.png" }],
    }, { fetcher });

    await expect(runtime.load(CUSTOMER_BRAND_LOGO_ASSET_ID)).resolves.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
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
