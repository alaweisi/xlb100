import type { CityConfigSnapshot } from "@xlb/types";

/** Build a city config snapshot from DB row data */
export function buildCityConfigSnapshot(
  row: CityConfigSnapshot,
): CityConfigSnapshot {
  return { ...row };
}

/** Check whether city is open for service */
export function isCityOpen(config: CityConfigSnapshot): boolean {
  return config.isOpen && config.serviceEnabled;
}
