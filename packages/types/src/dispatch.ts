import type { CityCode } from "./city.js";

export type DispatchTaskStatus = "pending" | "queued" | "failed" | "cancelled";

export interface DispatchTask {
  dispatchTaskId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  skuId: string;
  amount: number;
  sourceEventId: string;
  streamName: string;
  streamEntryId: string | null;
  status: DispatchTaskStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchStreamMessage {
  dispatchTaskId: string;
  orderId: string;
  cityCode: CityCode;
  customerId: string;
  skuId: string;
  amount: number;
  sourceEventId: string;
}
