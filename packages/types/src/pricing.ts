import type { CityCode } from "./city.js";
import type { ServiceSkuProfile, ServiceStandard } from "./catalog.js";

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

export type FeeItemType =
  | "base"
  | "labor"
  | "material"
  | "floor"
  | "distance"
  | "urgent"
  | "night"
  | "dismantle"
  | "diagnosis"
  | "enterprise_adjustment";

export type FeeChargeMethod =
  | "fixed"
  | "per_unit"
  | "range"
  | "onsite_quote"
  | "included";

/** Transparent fee item for a price rule */
export interface PriceFeeItem {
  feeItemId: string;
  cityCode: CityCode;
  priceRuleId: string;
  skuId: string;
  feeCode: string;
  feeName: string;
  feeType: FeeItemType;
  chargeMethod: FeeChargeMethod;
  amount: number;
  minAmount: number | null;
  maxAmount: number | null;
  unit: string | null;
  isOptional: boolean;
  isEnabled: boolean;
  sortOrder: number;
}

export interface PriceQuoteBreakdown {
  baseAmount: number;
  requiredFeeAmount: number;
  optionalFeeAmount: number;
  totalAmount: number;
  feeItems: PriceFeeItem[];
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
  skuProfile: ServiceSkuProfile | null;
  standards: ServiceStandard[];
  breakdown: PriceQuoteBreakdown;
}
