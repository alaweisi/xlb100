export const CUSTOMER_BRAND_LOGO_ASSET_ID = "customer.brand.logo" as const;

export type CustomerAssetMimeType =
  | "image/avif"
  | "image/webp"
  | "image/png"
  | "image/jpeg";

export type CustomerAssetSourcePolicy =
  | { readonly kind: "same-origin"; readonly pathPrefix: string }
  | { readonly kind: "https-allowlisted"; readonly allowedOrigins: readonly string[] };

export interface CustomerRuntimeAssetDescriptor {
  readonly id: string;
  readonly revision: string;
  readonly src: string;
  readonly mimeType: CustomerAssetMimeType;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly byteSize: number;
  readonly maxBytes: number;
  readonly integrity: string;
  readonly decorative: boolean;
  readonly altText: string | null;
  readonly preloadPriority: "none" | "low" | "high";
  readonly fallbackAssetId: string | null;
}

export interface CustomerRuntimeAssetManifest {
  readonly revision: string;
  readonly sourcePolicy: CustomerAssetSourcePolicy;
  readonly assets: readonly CustomerRuntimeAssetDescriptor[];
}

export interface VerifiedCustomerAsset {
  readonly asset: CustomerRuntimeAssetDescriptor;
  readonly verifiedSrc: string;
  readonly sourceSrc: string;
  readonly verifiedAt: string;
}

export type CustomerAssetFetcher = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export interface CustomerAssetRuntimeOptions {
  readonly fetcher?: CustomerAssetFetcher;
  readonly digestSha256?: (bytes: ArrayBuffer) => Promise<string>;
  readonly createObjectUrl?: (blob: Blob) => string;
  readonly revokeObjectUrl?: (url: string) => void;
  readonly now?: () => Date;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function defaultDigestSha256(bytes: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 verification is unavailable in this runtime");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return `sha256-${bytesToBase64(new Uint8Array(digest))}`;
}

function defaultCreateObjectUrl(blob: Blob): string {
  if (typeof URL.createObjectURL === "function") return URL.createObjectURL(blob);
  throw new Error("verified object URLs are unavailable in this runtime");
}

function sourceAllowed(src: string, policy: CustomerAssetSourcePolicy): boolean {
  if (policy.kind === "same-origin") {
    return src.startsWith(policy.pathPrefix) &&
      /^\/[A-Za-z0-9/_-]+\.(?:avif|webp|png|jpe?g)$/.test(src) &&
      !src.includes("..") &&
      !src.includes("\\");
  }

  try {
    const url = new URL(src);
    return url.protocol === "https:" &&
      url.username === "" &&
      url.password === "" &&
      policy.allowedOrigins.includes(url.origin);
  } catch {
    return false;
  }
}

function normalizedContentType(response: Response): string | null {
  const value = response.headers.get("content-type");
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? null;
}

/**
 * Loads only manifest-declared image bytes. A source is never exposed to React
 * until policy, MIME, byte-count and SRI checks have all passed.
 */
export class CustomerAssetRuntime {
  readonly #byId: ReadonlyMap<string, CustomerRuntimeAssetDescriptor>;
  readonly #fetcher: CustomerAssetFetcher;
  readonly #digestSha256: (bytes: ArrayBuffer) => Promise<string>;
  readonly #createObjectUrl: (blob: Blob) => string;
  readonly #revokeObjectUrl: (url: string) => void;
  readonly #now: () => Date;

  constructor(
    readonly manifest: CustomerRuntimeAssetManifest,
    options: CustomerAssetRuntimeOptions = {},
  ) {
    this.#byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
    this.#fetcher = options.fetcher ?? ((input, init) => fetch(input, init));
    this.#digestSha256 = options.digestSha256 ?? defaultDigestSha256;
    this.#createObjectUrl = options.createObjectUrl ?? defaultCreateObjectUrl;
    this.#revokeObjectUrl = options.revokeObjectUrl ?? ((url) => URL.revokeObjectURL(url));
    this.#now = options.now ?? (() => new Date());
  }

  async load(assetId: string, signal?: AbortSignal): Promise<VerifiedCustomerAsset | null> {
    const visited = new Set<string>();
    let asset = this.#byId.get(assetId) ?? null;

    while (asset !== null && !visited.has(asset.id)) {
      visited.add(asset.id);
      const loaded = await this.#loadOne(asset, signal).catch(() => null);
      if (loaded !== null) return loaded;
      asset = asset.fallbackAssetId === null
        ? null
        : this.#byId.get(asset.fallbackAssetId) ?? null;
    }

    return null;
  }

  release(asset: VerifiedCustomerAsset | null): void {
    if (asset === null) return;
    this.#revokeObjectUrl(asset.verifiedSrc);
  }

  async #loadOne(
    asset: CustomerRuntimeAssetDescriptor,
    signal?: AbortSignal,
  ): Promise<VerifiedCustomerAsset | null> {
    if (!sourceAllowed(asset.src, this.manifest.sourcePolicy)) return null;
    if (asset.byteSize > asset.maxBytes) return null;

    const response = await this.#fetcher(asset.src, {
      cache: "force-cache",
      credentials: this.manifest.sourcePolicy.kind === "same-origin" ? "same-origin" : "omit",
      mode: this.manifest.sourcePolicy.kind === "same-origin" ? "same-origin" : "cors",
      redirect: "error",
      referrerPolicy: "no-referrer",
      signal,
    });
    if (!response.ok || normalizedContentType(response) !== asset.mimeType) return null;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.byteSize || bytes.byteLength > asset.maxBytes) return null;
    if (await this.#digestSha256(bytes) !== asset.integrity) return null;

    const verifiedSrc = this.#createObjectUrl(new Blob([bytes], { type: asset.mimeType }));
    return Object.freeze({
      asset,
      verifiedSrc,
      sourceSrc: asset.src,
      verifiedAt: this.#now().toISOString(),
    });
  }
}
