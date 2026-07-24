import {
  baseTokens,
  mergeThemeTokens,
  resolveRuntimeTheme,
  type RuntimeThemeCapabilities,
  type RuntimeThemeFallbackReason,
  type RuntimeThemeScope,
  type ThemeTokenOverrides,
  type ThemeTokenPrimitive,
  type ThemeTokens,
} from "@xlb/ui";
import type { RuntimeThemeEnvelope } from "@xlb/types";
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
  type VerifiedCustomerAsset,
} from "./customerAssetRuntime.js";

/** Customer consumes the shared runtime-theme envelope without redefining it. */
export type CustomerPresentationEnvelope = RuntimeThemeEnvelope;

export interface CustomerPresentationEnvelopeValidator {
  safeParse(candidate: unknown):
    | { success: true; data: CustomerPresentationEnvelope }
    | { success: false };
}

export type CustomerPresentationFallbackReason = RuntimeThemeFallbackReason | "not-effective";

export interface ResolvedCustomerPresentation {
  readonly tokens: ThemeTokens;
  readonly themeId: string;
  readonly revision: string | null;
  readonly fallbackReason: CustomerPresentationFallbackReason | null;
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
  const parsed = validator.safeParse(candidate);
  const coreValidator = {
    safeParse(value: unknown) {
      const result = validator.safeParse(value);
      if (!result.success) return result;
      return {
        success: true as const,
        data: {
          ...result.data,
          tokenOverrides: result.data.tokenOverrides as ThemeTokenOverrides,
        },
      };
    },
  };
  if (parsed.success && !parsed.data.killSwitchActive &&
      Date.parse(parsed.data.effectiveAt) > now.getTime()) {
    const fallbackCore = resolveRuntimeTheme(
      null,
      scope,
      capabilities,
      { safeParse: () => ({ success: false as const }) },
      now,
    );
    const customerBase = mergeThemeTokens(baseTokens, customerThemeTokens);
    return Object.freeze({
      tokens: mergeThemeTokens(customerBase, runtimeDelta(baseTokens, fallbackCore.tokens)),
      themeId: "default",
      revision: null,
      fallbackReason: "not-effective",
      envelope: null,
    });
  }

  const core = resolveRuntimeTheme(candidate, scope, capabilities, coreValidator, now);
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

export type CustomerPresentationRuntimeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "fallback"
  | "last-safe";

export type CustomerPresentationLoadFailure = CustomerPresentationFallbackReason | "load-error";

export interface CustomerPresentationRuntimeSnapshot {
  readonly status: CustomerPresentationRuntimeStatus;
  readonly presentation: ResolvedCustomerPresentation | null;
  readonly failureReason: CustomerPresentationLoadFailure | null;
  readonly requestedScope: RuntimeThemeScope | null;
}

export interface CustomerPresentationLoadResult {
  readonly candidate: unknown;
}

export type CustomerPresentationLoader = (
  scope: RuntimeThemeScope,
  signal: AbortSignal,
) => Promise<CustomerPresentationLoadResult>;

function sameScope(envelope: RuntimeThemeEnvelope, scope: RuntimeThemeScope): boolean {
  return envelope.role === scope.role && envelope.mode === scope.mode && envelope.cityCode === scope.cityCode &&
    (envelope.routeScope === null || envelope.routeScope === scope.routeScope);
}

function remainsSafe(
  presentation: ResolvedCustomerPresentation,
  scope: RuntimeThemeScope,
  now: Date,
): boolean {
  const envelope = presentation.envelope;
  return envelope !== null && !envelope.killSwitchActive && sameScope(envelope, scope) &&
    Date.parse(envelope.effectiveAt) <= now.getTime() &&
    (envelope.expiresAt === null || Date.parse(envelope.expiresAt) > now.getTime());
}

/**
 * Delivery-independent bridge for P4/P8. Newer refreshes always win; a failed
 * refresh may retain only an unexpired, same-scope, previously validated view.
 */
export class CustomerPresentationRuntime {
  #generation = 0;
  #abortController: AbortController | null = null;
  #lastSafe: ResolvedCustomerPresentation | null = null;
  #snapshot: CustomerPresentationRuntimeSnapshot = Object.freeze({
    status: "idle",
    presentation: null,
    failureReason: null,
    requestedScope: null,
  });

  constructor(private readonly validator: CustomerPresentationEnvelopeValidator) {}

  get snapshot(): CustomerPresentationRuntimeSnapshot {
    return this.#snapshot;
  }

  async refresh(
    loader: CustomerPresentationLoader,
    scope: RuntimeThemeScope,
    capabilities: RuntimeThemeCapabilities,
    now = new Date(),
  ): Promise<CustomerPresentationRuntimeSnapshot> {
    const generation = ++this.#generation;
    this.#abortController?.abort();
    const abortController = new AbortController();
    this.#abortController = abortController;
    const safe = this.#lastSafe !== null && remainsSafe(this.#lastSafe, scope, now)
      ? this.#lastSafe
      : null;
    this.#snapshot = Object.freeze({
      status: "loading",
      presentation: safe,
      failureReason: null,
      requestedScope: scope,
    });

    try {
      const result = await loader(scope, abortController.signal);
      if (generation !== this.#generation) return this.#snapshot;
      const resolved = resolveCustomerPresentation(result.candidate, scope, capabilities, this.validator, now);
      if (resolved.fallbackReason === null) {
        this.#lastSafe = resolved;
        this.#snapshot = Object.freeze({
          status: "ready",
          presentation: resolved,
          failureReason: null,
          requestedScope: scope,
        });
      } else if (safe !== null && resolved.fallbackReason !== "kill-switch") {
        this.#snapshot = Object.freeze({
          status: "last-safe",
          presentation: safe,
          failureReason: resolved.fallbackReason,
          requestedScope: scope,
        });
      } else {
        if (resolved.fallbackReason === "kill-switch") this.#lastSafe = null;
        this.#snapshot = Object.freeze({
          status: "fallback",
          presentation: resolved,
          failureReason: resolved.fallbackReason,
          requestedScope: scope,
        });
      }
      return this.#snapshot;
    } catch {
      if (generation !== this.#generation) return this.#snapshot;
      const foundation = resolveCustomerPresentation(null, scope, capabilities, this.validator, now);
      this.#snapshot = Object.freeze({
        status: safe === null ? "fallback" : "last-safe",
        presentation: safe ?? foundation,
        failureReason: "load-error",
        requestedScope: scope,
      });
      return this.#snapshot;
    }
  }

  invalidate(): void {
    this.#generation += 1;
    this.#abortController?.abort();
    this.#abortController = null;
    this.#lastSafe = null;
    this.#snapshot = Object.freeze({
      status: "idle",
      presentation: null,
      failureReason: null,
      requestedScope: null,
    });
  }
}

export type CustomerBrandAssetState = "default" | "loading" | "ready" | "asset-failure";

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
        setBrandState("asset-failure");
        onBrandAssetStateChange?.("asset-failure");
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
