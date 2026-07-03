import type { PricingSnapshot } from "@xlb/types";

/** Build pricing snapshot metadata for a city */
export function buildPricingSnapshot(
  cityCode: string,
  version: number,
): PricingSnapshot {
  return {
    cityCode: cityCode as PricingSnapshot["cityCode"],
    version,
    generatedAt: new Date().toISOString(),
  };
}
