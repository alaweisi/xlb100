import type { CustomerSduiPageManifest } from "@xlb/types";
import { customerSduiPageManifestSchema } from "@xlb/validators";
import type {
  HomeManifestCacheStorage,
  HomeManifestRequestContext,
} from "./homeManifestDeliveryTypes.js";

export function createDefaultHomeManifestCacheStorage(): HomeManifestCacheStorage {
  try {
    if (typeof window !== "undefined" && window.localStorage !== undefined) {
      return new BrowserHomeManifestCacheStorage(window.localStorage);
    }
  } catch {
    // Privacy modes can deny localStorage access even when the property exists.
  }
  return new MemoryHomeManifestCacheStorage();
}

export interface CachedHomeManifest {
  readonly manifest: CustomerSduiPageManifest;
  readonly requestId: string;
  readonly resolvedAt: string;
  readonly storedAtMs: number;
  readonly freshUntilMs: number;
}

interface SerializedCachedHomeManifest {
  readonly formatVersion: 1;
  readonly manifest: unknown;
  readonly requestId: unknown;
  readonly resolvedAt: unknown;
  readonly storedAtMs: unknown;
  readonly freshUntilMs: unknown;
}

export class MemoryHomeManifestCacheStorage implements HomeManifestCacheStorage {
  readonly #entries = new Map<string, string>();

  getItem(key: string): string | null {
    return this.#entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.#entries.set(key, value);
  }

  removeItem(key: string): void {
    this.#entries.delete(key);
  }
}

export class BrowserHomeManifestCacheStorage implements HomeManifestCacheStorage {
  constructor(private readonly storage: Storage) {}

  getItem(key: string): string | null {
    return this.storage.getItem(key);
  }

  setItem(key: string, value: string): void {
    this.storage.setItem(key, value);
  }

  removeItem(key: string): void {
    this.storage.removeItem(key);
  }
}

export class HomeManifestCache {
  constructor(
    private readonly storage: HomeManifestCacheStorage,
    private readonly keyPrefix: string,
  ) {}

  keyFor(context: HomeManifestRequestContext): string {
    return [
      this.keyPrefix,
      context.pageId,
      context.cityCode,
      context.locale,
      context.appVersion,
    ].join(":");
  }

  async read(context: HomeManifestRequestContext): Promise<CachedHomeManifest | null> {
    const key = this.keyFor(context);
    let serialized: string | null;
    try {
      serialized = await this.storage.getItem(key);
    } catch {
      return null;
    }
    if (serialized === null) return null;

    try {
      const raw = JSON.parse(serialized) as SerializedCachedHomeManifest;
      const manifest = customerSduiPageManifestSchema.safeParse(raw.manifest);
      if (
        raw.formatVersion !== 1 ||
        !manifest.success ||
        typeof raw.requestId !== "string" ||
        raw.requestId.length === 0 ||
        typeof raw.resolvedAt !== "string" ||
        !Number.isFinite(Date.parse(raw.resolvedAt)) ||
        !Number.isSafeInteger(raw.storedAtMs) ||
        !Number.isSafeInteger(raw.freshUntilMs) ||
        (raw.storedAtMs as number) < 0 ||
        (raw.freshUntilMs as number) < (raw.storedAtMs as number) ||
        (raw.freshUntilMs as number) - (raw.storedAtMs as number) > 3_600_000
      ) {
        await this.remove(context);
        return null;
      }
      return Object.freeze({
        manifest: manifest.data,
        requestId: raw.requestId,
        resolvedAt: raw.resolvedAt,
        storedAtMs: raw.storedAtMs as number,
        freshUntilMs: raw.freshUntilMs as number,
      });
    } catch {
      await this.remove(context);
      return null;
    }
  }

  async write(
    context: HomeManifestRequestContext,
    value: CachedHomeManifest,
  ): Promise<void> {
    const serialized: SerializedCachedHomeManifest = {
      formatVersion: 1,
      manifest: value.manifest,
      requestId: value.requestId,
      resolvedAt: value.resolvedAt,
      storedAtMs: value.storedAtMs,
      freshUntilMs: value.freshUntilMs,
    };
    try {
      await this.storage.setItem(this.keyFor(context), JSON.stringify(serialized));
    } catch {
      // A storage quota/privacy failure must not discard a valid remote manifest.
    }
  }

  async remove(context: HomeManifestRequestContext): Promise<void> {
    try {
      await this.storage.removeItem(this.keyFor(context));
    } catch {
      // Cache removal is best-effort; compatibility checks still protect reads.
    }
  }
}
