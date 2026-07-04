import type { CityCode } from "./city.js";

export type SettlementBatchStatus = "prepared" | "confirmed" | "cancelled";
export type SettlementItemStatus = "prepared" | "confirmed" | "cancelled";

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
  confirmedAt: string | null;
  confirmedBy: string | null;
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

export interface SettlementConfirmedEventPayload {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  itemCount: number;
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  confirmedAt: string;
  confirmedBy: string;
}

export type SettlementPayableStatus = "payable";

export interface SettlementPayable {
  settlementPayableId: string;
  cityCode: CityCode;
  settlementBatchId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  status: SettlementPayableStatus;
  markedAt: string;
  markedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementPayableEventPayload {
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  markedAt: string;
  markedBy: string;
}
