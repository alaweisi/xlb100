import type { CityCode } from "@xlb/types";

/** Phase 1 seed cities — mirrors db/seed/001_cities.seed.sql (excludes __global__ marker) */
export const SEEDED_CITY_CODES: readonly CityCode[] = [
  "hangzhou",
  "shanghai",
  "beijing",
] as const;

export function isKnownCityCode(code: CityCode): boolean {
  return (SEEDED_CITY_CODES as readonly string[]).includes(code);
}
