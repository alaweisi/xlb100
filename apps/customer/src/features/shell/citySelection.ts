import type { KnownCityCode } from "@xlb/types";
import type { CustomerStorage } from "./sessionLifecycle.js";

export const CUSTOMER_SERVICE_CITIES = Object.freeze([
  Object.freeze({ cityCode: "hangzhou" as const, label: "杭州" }),
  Object.freeze({ cityCode: "shanghai" as const, label: "上海" }),
  Object.freeze({ cityCode: "beijing" as const, label: "北京" }),
]);

const CITY_STORAGE_KEY = "xlb.customer.cityCode";

export function isCustomerServiceCity(value: unknown): value is KnownCityCode {
  return CUSTOMER_SERVICE_CITIES.some((city) => city.cityCode === value);
}

export class CustomerCityRepository {
  constructor(private readonly storage: CustomerStorage) {}

  restore(): KnownCityCode | null {
    try {
      const value = this.storage.getItem(CITY_STORAGE_KEY);
      if (isCustomerServiceCity(value)) return value;
      if (value !== null) this.storage.removeItem(CITY_STORAGE_KEY);
      return null;
    } catch {
      return null;
    }
  }

  save(cityCode: KnownCityCode): boolean {
    try {
      this.storage.setItem(CITY_STORAGE_KEY, cityCode);
      return true;
    } catch {
      return false;
    }
  }
}
