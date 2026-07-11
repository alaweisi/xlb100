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

/** Fields accepted by the optimistic-concurrency city config update command. */
export interface CityConfigUpdate {
  expectedVersion: number;
  isOpen?: boolean;
  timezone?: string;
  serviceEnabled?: boolean;
  pricingEnabled?: boolean;
}

/** City-scoped API payload for an admin city config update. */
export interface UpdateCityConfigRequest extends CityConfigUpdate {
  cityCode: CityCode;
}
