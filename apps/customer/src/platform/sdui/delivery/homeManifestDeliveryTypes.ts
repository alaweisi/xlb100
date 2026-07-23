import type {
  CityCode,
  CustomerSduiPageId,
  CustomerSduiPageManifest,
  CustomerSduiResolutionReason,
} from "@xlb/types";

export interface HomeManifestRequestContext {
  readonly pageId: CustomerSduiPageId;
  readonly cityCode: CityCode;
  readonly locale: string;
  readonly appVersion: string;
  readonly forceRefresh?: boolean;
}

export interface HomeManifestTransport {
  load(
    context: HomeManifestRequestContext,
    signal: AbortSignal,
  ): Promise<unknown>;
}

export interface HomeManifestCacheStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export interface HomeManifestCircuitBreakerOptions {
  readonly failureThreshold: number;
  readonly cooldownMs: number;
}

export type HomeManifestCircuitState = "closed" | "open" | "half-open";

export type HomeManifestSource = "remote" | "fresh-cache" | "last-known-good" | "builtin";

export const HOME_MANIFEST_DELIVERY_REASONS = [
  "remote-published",
  "fresh-cache",
  "offline-lkg",
  "offline-builtin",
  "upstream-lkg",
  "upstream-builtin",
  "invalid-envelope-lkg",
  "invalid-envelope-builtin",
  "incompatible-manifest-lkg",
  "incompatible-manifest-builtin",
  "server-fallback-lkg",
  "server-fallback-builtin",
  "kill-switch",
  "circuit-open-lkg",
  "circuit-open-builtin",
] as const;

export type HomeManifestDeliveryReason = typeof HOME_MANIFEST_DELIVERY_REASONS[number];

export interface ReadyHomeManifestLoadResult {
  readonly status: "ready";
  readonly source: HomeManifestSource;
  readonly reason: HomeManifestDeliveryReason;
  readonly manifest: CustomerSduiPageManifest;
  readonly requestId: string | null;
  readonly resolutionReason: CustomerSduiResolutionReason | null;
  readonly previousRevision: string | null;
  readonly circuitState: HomeManifestCircuitState;
}

export interface SupersededHomeManifestLoadResult {
  readonly status: "superseded";
}

export type HomeManifestLoadResult =
  | ReadyHomeManifestLoadResult
  | SupersededHomeManifestLoadResult;

export type HomeManifestDeliveryTelemetryEvent =
  | { readonly type: "transport_timeout" };

export interface HomeManifestDeliveryOptions {
  readonly transport: HomeManifestTransport;
  readonly storage?: HomeManifestCacheStorage;
  readonly builtinManifest?: CustomerSduiPageManifest;
  readonly now?: () => Date;
  readonly isOnline?: () => boolean;
  readonly requestTimeoutMs?: number;
  readonly circuitBreaker?: Partial<HomeManifestCircuitBreakerOptions>;
  readonly cacheKeyPrefix?: string;
  readonly onEvent?: (event: HomeManifestDeliveryTelemetryEvent) => void;
}
