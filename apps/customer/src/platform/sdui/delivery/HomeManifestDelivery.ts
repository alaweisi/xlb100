import type {
  CustomerSduiManifestEnvelope,
  CustomerSduiPageManifest,
} from "@xlb/types";
import {
  customerSduiManifestEnvelopeSchema,
  customerSduiPageManifestSchema,
} from "@xlb/validators";
import {
  createDefaultHomeManifestCacheStorage,
  HomeManifestCache,
  type CachedHomeManifest,
} from "./HomeManifestCache.js";
import { getBuiltinHomeManifest } from "./builtinHomeManifest.js";
import type {
  HomeManifestCircuitState,
  HomeManifestDeliveryOptions,
  HomeManifestDeliveryReason,
  HomeManifestDeliveryTelemetryEvent,
  HomeManifestLoadResult,
  HomeManifestRequestContext,
  ReadyHomeManifestLoadResult,
} from "./homeManifestDeliveryTypes.js";

const DEFAULT_FAILURE_THRESHOLD = 3;
const DEFAULT_COOLDOWN_MS = 30_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000;
const DEFAULT_CACHE_PREFIX = "xlb.customer.sdui.manifest.v1";

type FallbackCause = "offline" | "upstream" | "invalid-envelope" | "incompatible-manifest" |
  "server-fallback" | "circuit-open";

function compareSemanticVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

/**
 * Owns delivery reliability only. Raw contract validation is delegated to the
 * frozen schemas in @xlb/validators; rendering remains owned by P3.
 */
export class HomeManifestDelivery {
  readonly #options: Required<Pick<HomeManifestDeliveryOptions, "now" | "isOnline">>;
  readonly #transport: HomeManifestDeliveryOptions["transport"];
  readonly #cache: HomeManifestCache;
  readonly #builtinManifest: CustomerSduiPageManifest;
  readonly #failureThreshold: number;
  readonly #cooldownMs: number;
  readonly #requestTimeoutMs: number;
  readonly #onEvent?: HomeManifestDeliveryOptions["onEvent"];

  #activeSequence = 0;
  #activeController: AbortController | null = null;
  #consecutiveFailures = 0;
  #circuitOpenedAtMs: number | null = null;

  constructor(options: HomeManifestDeliveryOptions) {
    this.#transport = options.transport;
    this.#options = {
      now: options.now ?? (() => new Date()),
      isOnline: options.isOnline ?? (() =>
        typeof navigator === "undefined" ? true : navigator.onLine),
    };
    this.#cache = new HomeManifestCache(
      options.storage ?? createDefaultHomeManifestCacheStorage(),
      options.cacheKeyPrefix ?? DEFAULT_CACHE_PREFIX,
    );
    this.#builtinManifest = customerSduiPageManifestSchema.parse(
      options.builtinManifest ?? getBuiltinHomeManifest(),
    );
    this.#failureThreshold = options.circuitBreaker?.failureThreshold ??
      DEFAULT_FAILURE_THRESHOLD;
    this.#cooldownMs = options.circuitBreaker?.cooldownMs ?? DEFAULT_COOLDOWN_MS;
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#onEvent = options.onEvent;

    if (!Number.isInteger(this.#failureThreshold) || this.#failureThreshold < 1) {
      throw new Error("Manifest circuit breaker failureThreshold must be a positive integer");
    }
    if (!Number.isFinite(this.#cooldownMs) || this.#cooldownMs < 1) {
      throw new Error("Manifest circuit breaker cooldownMs must be positive");
    }
    if (!Number.isFinite(this.#requestTimeoutMs) || this.#requestTimeoutMs < 1) {
      throw new Error("Manifest requestTimeoutMs must be positive");
    }
  }

  get circuitState(): HomeManifestCircuitState {
    if (this.#circuitOpenedAtMs === null) return "closed";
    return this.#options.now().getTime() - this.#circuitOpenedAtMs >= this.#cooldownMs
      ? "half-open"
      : "open";
  }

  async load(context: HomeManifestRequestContext): Promise<HomeManifestLoadResult> {
    const sequence = this.#beginRequest();
    const controller = this.#activeController!;
    const nowMs = this.#options.now().getTime();
    const cached = await this.#cache.read(context);
    if (!this.#isCurrent(sequence)) return { status: "superseded" };

    if (
      !context.forceRefresh &&
      cached !== null &&
      cached.freshUntilMs > nowMs &&
      this.#isCompatible(cached.manifest, context, nowMs)
    ) {
      return this.#ready(
        cached.manifest,
        "fresh-cache",
        "fresh-cache",
        cached.requestId,
        "published",
        null,
      );
    }

    if (!this.#options.isOnline()) {
      return this.#fallback(context, cached, "offline", null);
    }

    if (this.circuitState === "open") {
      return this.#fallback(context, cached, "circuit-open", null);
    }

    try {
      const rawEnvelope = await this.#loadWithTimeout(context, controller);
      if (!this.#isCurrent(sequence)) return { status: "superseded" };

      const parsedEnvelope = customerSduiManifestEnvelopeSchema.safeParse(rawEnvelope);
      if (!parsedEnvelope.success) {
        this.#recordFailure();
        return this.#fallback(context, cached, "invalid-envelope", null);
      }

      const envelope = parsedEnvelope.data;
      if (envelope.killSwitchActive) {
        this.#recordSuccess();
        await this.#cache.remove(context);
        if (!this.#isCurrent(sequence)) return { status: "superseded" };
        return this.#ready(
          this.#builtinManifest,
          "builtin",
          "kill-switch",
          envelope.requestId,
          envelope.resolutionReason,
          cached?.manifest.revision ?? null,
        );
      }

      if (envelope.resolutionReason !== "published" || envelope.manifest === null) {
        if (envelope.resolutionReason === "upstream_unavailable") {
          this.#recordFailure();
        } else {
          this.#recordSuccess();
        }
        return this.#fallback(
          context,
          cached,
          "server-fallback",
          envelope,
        );
      }

      if (!this.#isCompatible(envelope.manifest, context, nowMs)) {
        this.#recordFailure();
        return this.#fallback(
          context,
          cached,
          "incompatible-manifest",
          envelope,
        );
      }

      this.#recordSuccess();
      const previousRevision = cached?.manifest.revision ?? null;
      await this.#cache.write(context, {
        manifest: envelope.manifest,
        requestId: envelope.requestId,
        resolvedAt: envelope.resolvedAt,
        storedAtMs: nowMs,
        freshUntilMs: nowMs + envelope.cacheTtlSeconds * 1_000,
      });
      if (!this.#isCurrent(sequence)) return { status: "superseded" };

      return this.#ready(
        envelope.manifest,
        "remote",
        "remote-published",
        envelope.requestId,
        envelope.resolutionReason,
        previousRevision,
      );
    } catch (_error) {
      if (!this.#isCurrent(sequence)) {
        return { status: "superseded" };
      }
      this.#recordFailure();
      return this.#fallback(context, cached, "upstream", null);
    }
  }

  dispose(): void {
    this.#activeSequence += 1;
    this.#activeController?.abort();
    this.#activeController = null;
  }

  #beginRequest(): number {
    this.#activeSequence += 1;
    this.#activeController?.abort();
    this.#activeController = new AbortController();
    return this.#activeSequence;
  }

  #isCurrent(sequence: number): boolean {
    return sequence === this.#activeSequence;
  }

  #recordSuccess(): void {
    this.#consecutiveFailures = 0;
    this.#circuitOpenedAtMs = null;
  }

  #recordFailure(): void {
    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= this.#failureThreshold) {
      this.#circuitOpenedAtMs = this.#options.now().getTime();
    }
  }

  #loadWithTimeout(
    context: HomeManifestRequestContext,
    controller: AbortController,
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let timeout: ReturnType<typeof setTimeout> | null = null;
      const abortError = new Error("Customer SDUI manifest request aborted");
      abortError.name = "AbortError";
      let onAbort: () => void = () => undefined;
      const finish = (callback: () => void) => {
        if (settled) return;
        settled = true;
        controller.signal.removeEventListener("abort", onAbort);
        if (timeout !== null) clearTimeout(timeout);
        callback();
      };
      onAbort = () => finish(() => reject(abortError));
      controller.signal.addEventListener("abort", onAbort, { once: true });
      timeout = setTimeout(() => {
        this.#emit({ type: "transport_timeout" });
        controller.abort();
        finish(() => reject(new Error("Customer SDUI manifest request timed out")));
      }, this.#requestTimeoutMs);

      try {
        this.#transport.load(context, controller.signal).then(
          (value) => finish(() => resolve(value)),
          (error: unknown) => finish(() => reject(error)),
        );
      } catch (error) {
        finish(() => reject(error));
      }
    });
  }

  #emit(event: HomeManifestDeliveryTelemetryEvent): void {
    try {
      this.#onEvent?.(event);
    } catch {
      // Delivery observability is fail-open and cannot alter fallback behavior.
    }
  }

  #isCompatible(
    manifest: CustomerSduiPageManifest,
    context: HomeManifestRequestContext,
    nowMs: number,
  ): boolean {
    if (!customerSduiPageManifestSchema.safeParse(manifest).success) return false;
    if (manifest.pageId !== context.pageId) return false;
    if (!manifest.scope.locales.includes(context.locale)) return false;
    if (
      manifest.scope.cityCodes !== null &&
      !manifest.scope.cityCodes.includes(context.cityCode)
    ) {
      return false;
    }
    if (compareSemanticVersions(context.appVersion, manifest.scope.minimumAppVersion) < 0) {
      return false;
    }
    if (
      manifest.scope.maximumAppVersion !== null &&
      compareSemanticVersions(context.appVersion, manifest.scope.maximumAppVersion) > 0
    ) {
      return false;
    }
    if (Date.parse(manifest.effectiveAt) > nowMs) return false;
    if (manifest.expiresAt !== null && Date.parse(manifest.expiresAt) <= nowMs) return false;
    return true;
  }

  #isUsableLkg(
    cached: CachedHomeManifest | null,
    context: HomeManifestRequestContext,
    nowMs: number,
  ): cached is CachedHomeManifest {
    if (cached === null || !this.#isCompatible(cached.manifest, context, nowMs)) {
      return false;
    }
    const maximumStaleMs = cached.manifest.fallbackPolicy.maximumStaleSeconds * 1_000;
    return nowMs <= cached.freshUntilMs + maximumStaleMs;
  }

  #fallback(
    context: HomeManifestRequestContext,
    cached: CachedHomeManifest | null,
    cause: FallbackCause,
    envelope: CustomerSduiManifestEnvelope | null,
  ): ReadyHomeManifestLoadResult {
    const nowMs = this.#options.now().getTime();
    const useLkg = this.#isUsableLkg(cached, context, nowMs);
    const reason = `${cause}-${useLkg ? "lkg" : "builtin"}` as HomeManifestDeliveryReason;
    return this.#ready(
      useLkg ? cached.manifest : this.#builtinManifest,
      useLkg ? "last-known-good" : "builtin",
      reason,
      envelope?.requestId ?? null,
      envelope?.resolutionReason ?? null,
      cached?.manifest.revision ?? null,
    );
  }

  #ready(
    manifest: CustomerSduiPageManifest,
    source: ReadyHomeManifestLoadResult["source"],
    reason: HomeManifestDeliveryReason,
    requestId: string | null,
    resolutionReason: ReadyHomeManifestLoadResult["resolutionReason"],
    previousRevision: string | null,
  ): ReadyHomeManifestLoadResult {
    return Object.freeze({
      status: "ready",
      source,
      reason,
      manifest,
      requestId,
      resolutionReason,
      previousRevision,
      circuitState: this.circuitState,
    });
  }
}
