import type { CityCode } from "./city.js";

export interface WorkerQualification {
  workerId: string;
  cityCode: CityCode;
  skuId: string;
  isEligible: boolean;
  sourceCertificationId?: string | null;
  updatedAt: string;
}

export interface ServiceQualificationRule {
  ruleId: string;
  cityCode: CityCode;
  skuId: string;
  requiredCertType: string;
  isRequired: boolean;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}
