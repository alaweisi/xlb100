import type { CityCode } from "./city.js";

export type LedgerAccountType = "platform" | "worker" | "customer";
export type LedgerEntryDirection = "debit" | "credit";
export type LedgerAccrualStatus = "accrued" | "voided";

export interface LedgerAccount {
  accountId: string;
  cityCode: CityCode;
  accountType: LedgerAccountType;
  ownerId: string;
  currency: "CNY";
  status: "active";
  createdAt: string;
  updatedAt: string;
}

export interface LedgerEntry {
  entryId: string;
  cityCode: CityCode;
  accountId: string;
  accountType: LedgerAccountType;
  ownerId: string;
  sourceType: "fulfillment.completed";
  sourceId: string;
  direction: LedgerEntryDirection;
  amount: number;
  currency: "CNY";
  description: string | null;
  createdAt: string;
}

export interface LedgerAccrual {
  accrualId: string;
  cityCode: CityCode;
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
  sourceEventId: string;
  status: LedgerAccrualStatus;
  createdAt: string;
}
