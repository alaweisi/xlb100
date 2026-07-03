import type { CityConfigSnapshot } from "@xlb/types";
import type { CityCode } from "@xlb/types";

const cache = new Map<CityCode, { snapshot: CityConfigSnapshot; cachedAt: number }>();
const TTL_MS = 60_000;

/** In-memory city config cache skeleton (Phase 3) */
export function getCachedCityConfig(
  cityCode: CityCode,
): CityConfigSnapshot | undefined {
  const entry = cache.get(cityCode);
  if (!entry) return undefined;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(cityCode);
    return undefined;
  }
  return entry.snapshot;
}

export function setCachedCityConfig(snapshot: CityConfigSnapshot): void {
  cache.set(snapshot.cityCode, { snapshot, cachedAt: Date.now() });
}

export function invalidateCityConfigCache(cityCode: CityCode): void {
  cache.delete(cityCode);
}

export function clearCityConfigCache(): void {
  cache.clear();
}
