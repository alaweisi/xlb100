import type { CityCode } from "./city.js";

export type WorkerProfileStatus = "active" | "suspended" | "disabled";

export interface WorkerProfile {
  workerId: string;
  displayName: string;
  phoneMasked: string | null;
  status: WorkerProfileStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerCityBinding {
  workerId: string;
  cityCode: CityCode;
  isEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerOnlineStatus {
  workerId: string;
  cityCode: CityCode;
  isOnline: boolean;
  updatedAt: string;
}
