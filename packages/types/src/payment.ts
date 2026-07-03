import type { CityCode } from "./city.js";

export type PaymentStatus = "pending" | "paid" | "failed" | "closed";

export type PaymentProvider = "mock";

export interface PaymentOrderMetadata {
  orderId: string;
  cityCode: CityCode;
  skuId: string;
  priceRuleId: string;
  customerId?: string;
}

export interface PaymentOrder {
  paymentOrderId: string;
  orderId: string;
  cityCode: CityCode;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: PaymentProvider;
  providerTradeNo: string | null;
  metadata: PaymentOrderMetadata;
  createdAt: string;
  updatedAt: string;
}
