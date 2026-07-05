import type { CityCode } from "./city.js";

export type RefundRequestStatus = "requested" | "approved";

export interface RefundRequest {
  refundId: string;
  cityCode: CityCode;
  orderId: string;
  customerId: string;
  fulfillmentId: string;
  paymentOrderId: string;
  amount: number;
  currency: "CNY";
  reason: string | null;
  status: RefundRequestStatus;
  requestedAt: string;
  approvedAt: string | null;
  approvedByAdminId: string | null;
}

export interface CreateRefundRequest {
  orderId: string;
  amount?: number;
  reason?: string;
}

export interface ApproveRefundRequest {
  approvedByAdminId?: string;
}
