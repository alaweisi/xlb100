import type {
  CustomerSduiApi,
  CustomerSduiManifestCacheEntry,
} from "@xlb/api-client";
import type { CustomerSduiManifestEnvelope } from "@xlb/types";
import { customerSduiManifestEnvelopeSchema } from "@xlb/validators";
import {
  createDefaultHomeManifestCacheStorage,
} from "./HomeManifestCache.js";
import type {
  HomeManifestCacheStorage,
  HomeManifestRequestContext,
  HomeManifestTransport,
} from "./homeManifestDeliveryTypes.js";

const DEFAULT_CONDITIONAL_CACHE_PREFIX = "xlb.customer.sdui.http.v1";
const MAX_ETAG_LENGTH = 512;

interface SerializedConditionalCacheEntry {
  readonly formatVersion: 1;
  readonly etag: unknown;
  readonly envelope: unknown;
}

export interface CustomerSduiHomeManifestTransportOptions {
  readonly api: Pick<CustomerSduiApi, "getPublishedManifestConditional">;
  readonly storage?: HomeManifestCacheStorage;
  readonly cacheKeyPrefix?: string;
}

function isValidEtag(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 3 &&
    value.length <= MAX_ETAG_LENGTH &&
    /^(?:W\/)?"[^"\r\n]+"$/.test(value);
}

function abortError(signal: AbortSignal): unknown {
  if (signal.reason !== undefined) return signal.reason;
  const error = new Error("Customer SDUI manifest request aborted");
  error.name = "AbortError";
  return error;
}

/**
 * Production bridge between the P6 conditional API and the P4 reliability
 * delivery layer. It owns only HTTP validator state; manifest compatibility,
 * LKG, timeout, circuit breaking and Kill Switch behavior remain in P4.
 */
export class CustomerSduiHomeManifestTransport implements HomeManifestTransport {
  readonly #api: CustomerSduiHomeManifestTransportOptions["api"];
  readonly #storage: HomeManifestCacheStorage;
  readonly #cacheKeyPrefix: string;

  constructor(options: CustomerSduiHomeManifestTransportOptions) {
    this.#api = options.api;
    this.#storage = options.storage ?? createDefaultHomeManifestCacheStorage();
    this.#cacheKeyPrefix = options.cacheKeyPrefix ?? DEFAULT_CONDITIONAL_CACHE_PREFIX;
  }

  async load(
    context: HomeManifestRequestContext,
    signal: AbortSignal,
  ): Promise<CustomerSduiManifestEnvelope> {
    if (signal.aborted) throw abortError(signal);
    const cached = await this.#read(context);
    if (signal.aborted) throw abortError(signal);

    const result = await this.#api.getPublishedManifestConditional(
      context.pageId,
      {
        appVersion: context.appVersion,
        locale: context.locale,
      },
      cached ?? undefined,
      { signal },
    );
    if (signal.aborted) throw abortError(signal);

    // Re-validate at the application boundary even though @xlb/api-client also
    // validates. This prevents test doubles or future adapters from injecting
    // an untrusted cached envelope into the delivery layer.
    const envelope = customerSduiManifestEnvelopeSchema.parse(result.envelope);
    if (envelope.resolutionReason === "published") {
      if (result.etag === null || !isValidEtag(result.etag)) {
        await this.#remove(context);
        throw new TypeError("Published Customer SDUI manifest response has no valid ETag");
      }
      await this.#write(context, { etag: result.etag, envelope });
    } else {
      // Kill Switch and every no-store/fallback response must invalidate the
      // conditional copy so a future request cannot replay stale published UI.
      await this.#remove(context);
    }
    if (signal.aborted) throw abortError(signal);
    return envelope;
  }

  #keyFor(context: HomeManifestRequestContext): string {
    return [
      this.#cacheKeyPrefix,
      context.pageId,
      context.cityCode,
      context.locale,
      context.appVersion,
    ].join(":");
  }

  async #read(
    context: HomeManifestRequestContext,
  ): Promise<CustomerSduiManifestCacheEntry | null> {
    const key = this.#keyFor(context);
    let serialized: string | null;
    try {
      serialized = await this.#storage.getItem(key);
    } catch {
      return null;
    }
    if (serialized === null) return null;

    try {
      const raw = JSON.parse(serialized) as SerializedConditionalCacheEntry;
      const envelope = customerSduiManifestEnvelopeSchema.safeParse(raw.envelope);
      if (
        raw.formatVersion !== 1 ||
        !isValidEtag(raw.etag) ||
        !envelope.success ||
        envelope.data.resolutionReason !== "published" ||
        envelope.data.manifest === null
      ) {
        await this.#remove(context);
        return null;
      }
      return Object.freeze({ etag: raw.etag, envelope: envelope.data });
    } catch {
      await this.#remove(context);
      return null;
    }
  }

  async #write(
    context: HomeManifestRequestContext,
    value: CustomerSduiManifestCacheEntry,
  ): Promise<void> {
    const serialized: SerializedConditionalCacheEntry = {
      formatVersion: 1,
      etag: value.etag,
      envelope: value.envelope,
    };
    try {
      await this.#storage.setItem(this.#keyFor(context), JSON.stringify(serialized));
    } catch {
      // Conditional caching is an optimization; a valid 200 response still wins.
    }
  }

  async #remove(context: HomeManifestRequestContext): Promise<void> {
    try {
      await this.#storage.removeItem(this.#keyFor(context));
    } catch {
      // Best effort. Every subsequent read still validates the cached record.
    }
  }
}
