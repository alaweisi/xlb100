import {
  baseTokens,
  mergeThemeTokens,
  resolveRuntimeTheme,
  type RuntimeThemeCapabilities,
  type RuntimeThemeEnvelopeValidator,
  type RuntimeThemeFallbackReason,
  type RuntimeThemeScope,
  type ThemeTokenOverrides,
  type ThemeTokenPrimitive,
  type ThemeTokens,
} from "@xlb/ui";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  BrandLogoProvider,
  defaultBrandLogoConfig,
  type BrandLogoConfig,
} from "../foundation/BrandLogo.js";
import { CustomerDesignSystemRoot } from "../foundation/CustomerDesignSystemRoot.js";
import { customerThemeTokens } from "../tokens/customerTokens.js";
import {
  CUSTOMER_BRAND_LOGO_ASSET_ID,
  CustomerAssetRuntime,
  type CustomerAssetRuntimeOptions,
  type CustomerRuntimeAssetManifest,
  type VerifiedCustomerAsset,
} from "./customerAssetRuntime.js";

export interface CustomerPresentationEnvelope {
  readonly revision: string;
  readonly resolvedThemeId: string;
  readonly role: string;
  readonly mode: string;
  readonly cityCode: string;
  readonly routeScope: string | null;
  readonly tokenOverrides: ThemeTokenOverrides;
  readonly expiresAt: string | null;
  readonly killSwitchActive: boolean;
  readonly assetManifest: CustomerRuntimeAssetManifest | null;
}

export interface CustomerPresentationEnvelopeValidator extends RuntimeThemeEnvelopeValidator {
  safeParse(candidate: unknown):
    | { success: true; data: CustomerPresentationEnvelope }
    | { success: false };
}

export interface ResolvedCustomerPresentation {
  readonly tokens: ThemeTokens;
  readonly themeId: string;
  readonly revision: string | null;
  readonly fallbackReason: RuntimeThemeFallbackReason | null;
  readonly envelope: CustomerPresentationEnvelope | null;
}

function isTokenTree(value: unknown): value is ThemeTokens {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function runtimeDelta(
  baseline: ThemeTokens,
  resolved: ThemeTokens,
): ThemeTokenOverrides {
  const delta: Record<string, ThemeTokenPrimitive | ThemeTokens> = Object.create(null);

  for (const [key, baselineValue] of Object.entries(baseline)) {
    const resolvedValue = resolved[key];
    if (isTokenTree(baselineValue) && isTokenTree(resolvedValue)) {
      const child = runtimeDelta(baselineValue, resolvedValue);
      if (Object.keys(child).length > 0) delta[key] = child;
    } else if ((typeof resolvedValue === "string" || typeof resolvedValue === "number") &&
      resolvedValue !== baselineValue) {
      delta[key] = resolvedValue;
    }
  }

  return delta;
}

/**
 * Preserves the approved Customer foundation while applying only the already
 * validated L4/L7 delta emitted by the shared runtime-theme resolver.
 */
export function resolveCustomerPresentation(
  candidate: unknown,
  scope: RuntimeThemeScope,
  capabilities: RuntimeThemeCapabilities,
  validator: CustomerPresentationEnvelopeValidator,
  now = new Date(),
): ResolvedCustomerPresentation {
  const core = resolveRuntimeTheme(candidate, scope, capabilities, validator, now);
  const parsed = validator.safeParse(candidate);
  const customerBase = mergeThemeTokens(baseTokens, customerThemeTokens);
  const tokens = mergeThemeTokens(customerBase, runtimeDelta(baseTokens, core.tokens));

  return Object.freeze({
    tokens,
    themeId: core.themeId,
    revision: core.revision,
    fallbackReason: core.fallbackReason,
    envelope: parsed.success && core.fallbackReason === null ? parsed.data : null,
  });
}

export type CustomerBrandAssetState = "default" | "loading" | "ready" | "fallback";

export interface CustomerPresentationProviderProps extends CustomerAssetRuntimeOptions {
  readonly candidate: unknown;
  readonly scope: RuntimeThemeScope;
  readonly capabilities: RuntimeThemeCapabilities;
  readonly validator: CustomerPresentationEnvelopeValidator;
  readonly children: ReactNode;
  readonly className?: string;
  readonly logoAssetId?: string;
  readonly nowDate?: Date;
  readonly onBrandAssetStateChange?: (state: CustomerBrandAssetState) => void;
}

function logoConfigFrom(asset: VerifiedCustomerAsset): BrandLogoConfig | null {
  if (asset.asset.decorative || asset.asset.altText === null) return null;
  return {
    kind: "image",
    src: asset.verifiedSrc,
    accessibleName: asset.asset.altText,
    fallbackText: "xlb100",
  };
}

export function CustomerPresentationProvider({
  candidate,
  scope,
  capabilities,
  validator,
  children,
  className,
  logoAssetId = CUSTOMER_BRAND_LOGO_ASSET_ID,
  nowDate,
  onBrandAssetStateChange,
  fetcher,
  digestSha256,
  createObjectUrl,
  revokeObjectUrl,
  now,
}: CustomerPresentationProviderProps) {
  const presentation = useMemo(
    () => resolveCustomerPresentation(candidate, scope, capabilities, validator, nowDate),
    [candidate, capabilities, nowDate, scope, validator],
  );
  const [logo, setLogo] = useState<BrandLogoConfig>(defaultBrandLogoConfig);
  const [brandState, setBrandState] = useState<CustomerBrandAssetState>("default");
  const assetOptions = useMemo<CustomerAssetRuntimeOptions>(() => ({
    fetcher,
    digestSha256,
    createObjectUrl,
    revokeObjectUrl,
    now,
  }), [createObjectUrl, digestSha256, fetcher, now, revokeObjectUrl]);

  useEffect(() => {
    const manifest = presentation.envelope?.assetManifest ?? null;
    if (manifest === null) {
      setLogo(defaultBrandLogoConfig);
      setBrandState("default");
      onBrandAssetStateChange?.("default");
      return;
    }

    const abortController = new AbortController();
    const runtime = new CustomerAssetRuntime(manifest, assetOptions);
    let current: VerifiedCustomerAsset | null = null;
    let active = true;
    setLogo(defaultBrandLogoConfig);
    setBrandState("loading");
    onBrandAssetStateChange?.("loading");

    void runtime.load(logoAssetId, abortController.signal).then((loaded) => {
      if (!active) {
        runtime.release(loaded);
        return;
      }
      current = loaded;
      const config = loaded === null ? null : logoConfigFrom(loaded);
      if (config === null) {
        runtime.release(loaded);
        current = null;
        setLogo(defaultBrandLogoConfig);
        setBrandState("fallback");
        onBrandAssetStateChange?.("fallback");
        return;
      }
      setLogo(config);
      setBrandState("ready");
      onBrandAssetStateChange?.("ready");
    });

    return () => {
      active = false;
      abortController.abort();
      runtime.release(current);
    };
  }, [assetOptions, logoAssetId, onBrandAssetStateChange, presentation.envelope]);

  return (
    <div
      className={className}
      data-brand-asset-state={brandState}
      data-customer-presentation-fallback={presentation.fallbackReason ?? undefined}
      data-customer-presentation-revision={presentation.revision ?? undefined}
    >
      <CustomerDesignSystemRoot
        resolvedTokens={presentation.tokens}
        themeId={presentation.themeId}
      >
        <BrandLogoProvider value={logo}>{children}</BrandLogoProvider>
      </CustomerDesignSystemRoot>
    </div>
  );
}
