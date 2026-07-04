import type { CityCode } from "./city.js";

export type SettlementBatchStatus = "prepared" | "cancelled";
export type SettlementItemStatus = "prepared" | "cancelled";

export interface SettlementBatch {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  itemCount: number;
  status: SettlementBatchStatus;
  preparedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementItem {
  settlementItemId: string;
  settlementBatchId: string;
  cityCode: CityCode;
  accrualId: string;
  fulfillmentId: string;
  orderId: string;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  skuId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  currency: "CNY";
  status: SettlementItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementPreparedEventPayload {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  itemCount: number;
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  preparedAt: string;
}
