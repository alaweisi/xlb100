import type { CityCode } from "@xlb/types";

/** Normalize city_code to canonical lowercase form */
export function canonicalizeCityCode(raw: string): CityCode {
  return raw.trim().toLowerCase();
}
