import type { CityCode } from "./city.js";

/** City-level configuration snapshot — not order/payment data */
export interface CityConfigSnapshot {
  cityCode: CityCode;
  version: number;
  isOpen: boolean;
  timezone: string;
  serviceEnabled: boolean;
  pricingEnabled: boolean;
  updatedAt: string;
}
