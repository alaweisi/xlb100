import type { CSSProperties, ReactNode } from "react";

export type CampaignPlacement =
  | "header-decoration" | "hero-artwork" | "blessing-copy" | "banner"
  | "badge" | "ambient-background" | "navigation-accent";

export interface RuntimePresentationAsset {
  readonly id: string;
  readonly src: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly decorative: boolean;
  readonly altText: string | null;
  readonly preloadPriority: "none" | "low" | "high";
  readonly fallbackAssetId: string | null;
}

export interface RuntimePresentationManifest {
  readonly sourcePolicy: { readonly kind: "same-origin"; readonly pathPrefix: string } | { readonly kind: "https-allowlisted"; readonly allowedOrigins: readonly string[] };
  readonly assets: readonly RuntimePresentationAsset[];
}

export interface RuntimePresentationEnvelope {
  readonly placementScope: readonly CampaignPlacement[];
  readonly presentation: { readonly placements: readonly { readonly placement: CampaignPlacement; readonly headline: string | null; readonly body: string | null; readonly badgeLabel: string | null; readonly assetId: string | null; readonly cta: { readonly label: string; readonly actionKey: string } | null }[] } | null;
  readonly assetManifest: RuntimePresentationManifest | null;
}

/** An application-owned mapping. A campaign payload can name a key, never a URL or handler. */
export type CampaignActionRegistry = Readonly<Record<string, () => void>>;

export interface ResolvedCampaignAsset {
  readonly asset: RuntimePresentationAsset;
  readonly src: string;
}

export interface ResolvedCampaignSlot {
  readonly placement: CampaignPlacement;
  readonly headline: string | null;
  readonly body: string | null;
  readonly badgeLabel: string | null;
  readonly asset: ResolvedCampaignAsset | null;
  readonly cta: { readonly label: string; readonly actionKey: string } | null;
}

function sourceAllowed(src: string, manifest: RuntimePresentationManifest): boolean {
  if (manifest.sourcePolicy.kind === "same-origin") {
    return src.startsWith(manifest.sourcePolicy.pathPrefix) &&
      /^\/[A-Za-z0-9/_-]+\.(?:avif|webp|png|jpe?g)$/.test(src);
  }
  try {
    const url = new URL(src);
    return url.protocol === "https:" && url.username === "" && url.password === "" &&
      manifest.sourcePolicy.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

function resolveAsset(assetId: string | null, manifest: RuntimePresentationManifest | null): ResolvedCampaignAsset | null {
  if (assetId === null || manifest === null) return null;
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const visited = new Set<string>();
  let current = byId.get(assetId) ?? null;
  while (current !== null && !visited.has(current.id)) {
    visited.add(current.id);
    if (sourceAllowed(current.src, manifest)) return { asset: current, src: current.src };
    current = current.fallbackAssetId === null ? null : byId.get(current.fallbackAssetId) ?? null;
  }
  return null;
}

/**
 * Re-checks manifest references at the rendering boundary. Invalid decoration is
 * omitted; it cannot prevent the workflow surface from rendering.
 */
export function resolveCampaignPresentation(
  envelope: RuntimePresentationEnvelope,
  actions: CampaignActionRegistry = {},
): readonly ResolvedCampaignSlot[] {
  if (envelope.presentation === null) return Object.freeze([]);
  const allowedPlacements = new Set(envelope.placementScope);
  return Object.freeze(envelope.presentation.placements.flatMap((placement) => {
    if (!allowedPlacements.has(placement.placement)) return [];
    const cta = placement.cta !== null && actions[placement.cta.actionKey] !== undefined
      ? { label: placement.cta.label, actionKey: placement.cta.actionKey }
      : null;
    return [{
      placement: placement.placement,
      headline: placement.headline,
      body: placement.body,
      badgeLabel: placement.badgeLabel,
      asset: resolveAsset(placement.assetId, envelope.assetManifest),
      cta,
    } satisfies ResolvedCampaignSlot];
  }));
}

export interface CampaignSlotProps {
  readonly slot: ResolvedCampaignSlot;
  readonly actions?: CampaignActionRegistry;
  readonly children?: ReactNode;
  readonly style?: CSSProperties;
}

/** Decorative-only slot renderer: no remote HTML, styles, navigation, or executable content. */
export function CampaignSlot({ slot, actions = {}, children, style }: CampaignSlotProps) {
  const image = slot.asset;
  return (
    <aside
      aria-label={slot.headline ?? slot.badgeLabel ?? undefined}
      data-campaign-placement={slot.placement}
      style={{ color: "var(--xlb-text-primary)", position: "relative", ...style }}
    >
      {image !== null ? (
        <img
          alt={image.asset.decorative ? "" : image.asset.altText ?? ""}
          aria-hidden={image.asset.decorative || undefined}
          decoding="async"
          height={image.asset.heightPx}
          loading={image.asset.preloadPriority === "high" ? "eager" : "lazy"}
          src={image.src}
          style={{ height: "auto", maxWidth: "100%", pointerEvents: "none" }}
          width={image.asset.widthPx}
        />
      ) : null}
      {slot.headline !== null ? <strong>{slot.headline}</strong> : null}
      {slot.body !== null ? <p>{slot.body}</p> : null}
      {slot.badgeLabel !== null ? <span>{slot.badgeLabel}</span> : null}
      {slot.cta !== null ? (
        <button onClick={actions[slot.cta.actionKey]} type="button">{slot.cta.label}</button>
      ) : null}
      {children}
    </aside>
  );
}
