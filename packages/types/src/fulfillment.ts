import type { CityCode } from "./city.js";

export type FulfillmentStatus =
  | "accepted"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface Fulfillment {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
  status: FulfillmentStatus;
  startedAt?: string | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentCreatedEventPayload {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  workerId: string;
  skuId: string;
  status: FulfillmentStatus;
}
