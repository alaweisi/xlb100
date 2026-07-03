import type { CityCode } from "./city.js";

export type WorkerTaskAcceptanceStatus = "accepted" | "cancelled";

export interface WorkerTaskAcceptance {
  acceptanceId: string;
  dispatchTaskId: string;
  cityCode: CityCode;
  orderId: string;
  workerId: string;
  skuId: string;
  status: WorkerTaskAcceptanceStatus;
  acceptedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchAcceptedEventPayload {
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
  acceptedAt: string;
}
