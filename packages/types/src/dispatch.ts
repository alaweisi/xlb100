import type { CityCode } from "./city.js";

export type DispatchTaskStatus =
  | "pending"
  | "queued"
  | "offering"
  | "accepted"
  | "expired"
  | "reassigning"
  | "completed"
  | "rejected"
  | "timeout"
  | "no_match"
  | "manual_review"
  | "failed"
  | "cancelled";

export type DispatchOfferStatus =
  | "offering"
  | "accepted"
  | "rejected"
  | "timeout"
  | "cancelled";

export type DispatchEventType =
  | "TASK_QUEUED"
  | "OFFER_CREATED"
  | "WORKER_ACCEPTED"
  | "WORKER_REJECTED"
  | "OFFER_CANCELLED"
  | "OFFER_TIMEOUT"
  | "NO_MATCH"
  | "REASSIGNING"
  | "MANUAL_REVIEW"
  | "TASK_COMPLETED";

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
  attemptCount?: number;
  maxAttempts?: number;
  lastReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DispatchOffer {
  offerId: string;
  dispatchTaskId: string;
  cityCode: CityCode;
  workerId: string;
  status: DispatchOfferStatus;
  distanceKm: number | null;
  offeredAt: string;
  respondedAt: string | null;
}

export interface DispatchEvent {
  dispatchEventId: string;
  dispatchTaskId: string;
  cityCode: CityCode;
  eventType: DispatchEventType;
  workerId: string | null;
  reason: string | null;
  createdAt: string;
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
