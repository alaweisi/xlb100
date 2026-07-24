import type { KnownCityCode } from "@xlb/types";
import type { CustomerAuthenticatedSession, CustomerStorage } from "./sessionLifecycle.js";

const SCOPED_CACHE_PREFIXES = [
  "xlb.customer.sdui.",
  "xlb.customer.data.",
  "xlb.customer.feature.",
] as const;

export interface CustomerCacheScope {
  readonly key: string;
  readonly revision: number;
  readonly cityCode: KnownCityCode | null;
  readonly authenticated: boolean;
}

export type CustomerCacheInvalidator = (
  previous: CustomerCacheScope,
  next: CustomerCacheScope,
) => void | Promise<void>;

function actorRef(actor: CustomerAuthenticatedSession["actor"] | null): string {
  if (actor === null) return "guest";
  let hash = 2_166_136_261;
  for (const character of actor.userId) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return `actor-${(hash >>> 0).toString(36)}`;
}

function scopeKey(
  actor: CustomerAuthenticatedSession["actor"] | null,
  cityCode: KnownCityCode | null,
): string {
  return `${actorRef(actor)}:${cityCode ?? "city-unresolved"}`;
}

export function clearCustomerScopedBrowserCaches(storage: CustomerStorage): void {
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key !== null && SCOPED_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        keys.push(key);
      }
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Cache invalidation is best effort. Scope keys still prevent stale reads.
  }
}

export class CustomerCacheScopeCoordinator {
  #actor: CustomerAuthenticatedSession["actor"] | null = null;
  #cityCode: KnownCityCode | null = null;
  #revision = 0;
  #initialized = false;
  readonly #invalidators = new Set<CustomerCacheInvalidator>();

  constructor(invalidator?: CustomerCacheInvalidator) {
    if (invalidator !== undefined) this.#invalidators.add(invalidator);
  }

  snapshot(): CustomerCacheScope {
    return Object.freeze({
      key: scopeKey(this.#actor, this.#cityCode),
      revision: this.#revision,
      cityCode: this.#cityCode,
      authenticated: this.#actor !== null,
    });
  }

  registerInvalidator(invalidator: CustomerCacheInvalidator): () => void {
    this.#invalidators.add(invalidator);
    return () => this.#invalidators.delete(invalidator);
  }

  async rotate(
    actor: CustomerAuthenticatedSession["actor"] | null,
    cityCode: KnownCityCode | null,
    forceInvalidation = false,
  ): Promise<CustomerCacheScope> {
    const previous = this.snapshot();
    const nextKey = scopeKey(actor, cityCode);
    this.#actor = actor;
    this.#cityCode = cityCode;
    if (!this.#initialized && !forceInvalidation) {
      this.#initialized = true;
      return this.snapshot();
    }
    this.#initialized = true;
    if (previous.key === nextKey && !forceInvalidation) return this.snapshot();

    this.#revision += 1;
    const next = this.snapshot();
    await Promise.all([...this.#invalidators].map(async (invalidator) => {
      try {
        await invalidator(previous, next);
      } catch {
        // A failing cache consumer cannot block identity isolation.
      }
    }));
    return next;
  }
}
