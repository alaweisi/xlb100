import type { CityCode } from "./city.js";

export interface WorkerDispatchEligibility {
  workerId: string;
  cityCode: CityCode;
  skuId: string;
  isEligible: boolean;
  reasons: string[];
}
