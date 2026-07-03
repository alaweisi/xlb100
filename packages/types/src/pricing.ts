import type { CityCode } from "./city.js";

/** City-scoped price rule — not payment or order */
export interface PriceRule {
  priceRuleId: string;
  cityCode: CityCode;
  skuId: string;
  basePrice: number;
  currency: string;
  isEnabled: boolean;
  version: number;
}

/** Pricing snapshot for a city */
export interface PricingSnapshot {
  cityCode: CityCode;
  version: number;
  generatedAt: string;
}

/** Quote result — price rule read, not order quote */
export interface PriceQuote {
  cityCode: CityCode;
  skuId: string;
  basePrice: number;
  currency: string;
  priceRuleId: string;
  version: number;
}
