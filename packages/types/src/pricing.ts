import type { CityCode } from "./city.js";

export type PriceType =
  | "fixed"
  | "range"
  | "from"
  | "estimate_from"
  | "onsite_quote";

/** City-scoped price rule — not payment or order */
export interface PriceRule {
  priceRuleId: string;
  cityCode: CityCode;
  skuId: string;
  basePrice: number;
  currency: string;
  priceText: string;
  priceType: PriceType;
  minPrice: number | null;
  maxPrice: number | null;
  pricingNote: string | null;
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
  priceText: string;
  priceType: PriceType;
  minPrice: number | null;
  maxPrice: number | null;
  pricingNote: string | null;
  priceRuleId: string;
  version: number;
}
