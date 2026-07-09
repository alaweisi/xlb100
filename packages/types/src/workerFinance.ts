import type { CityCode } from "./city.js";

export type WorkerBankAccountStatus = "active" | "inactive";
export type WorkerWithdrawalStatus =
  | "requested"
  | "approved"
  | "rejected"
  | "marked_paid"
  | "cancelled";
export type WorkerWithdrawalReviewDecision = "approved" | "rejected";

export interface WorkerReceivableBalance {
  cityCode: CityCode;
  workerId: string;
  currency: "CNY";
  accruedAmount: number;
  adjustedAmount: number;
  requestedWithdrawalAmount: number;
  markedPaidAmount: number;
  availableAmount: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerReceivableAdjustment {
  adjustmentId: string;
  cityCode: CityCode;
  refundId: string;
  sourceEventId: string;
  accrualId: string;
  fulfillmentId: string;
  orderId: string;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  grossAdjustment: number;
  platformFeeAdjustment: number;
  workerReceivableAdjustment: number;
  currency: "CNY";
  reason: "refund.approved";
  status: "applied";
  appliedAt: string;
  createdAt: string;
}

export interface WorkerBankAccount {
  bankAccountId: string;
  cityCode: CityCode;
  workerId: string;
  accountHolder: string;
  bankName: string;
  bankBranch: string | null;
  bankCardMasked: string;
  bankCardLast4: string;
  status: WorkerBankAccountStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkerBankAccountRequest {
  accountHolder: string;
  bankName: string;
  bankBranch?: string | null;
  bankCardNumber: string;
}

export interface WorkerWithdrawalRequest {
  withdrawalId: string;
  cityCode: CityCode;
  workerId: string;
  bankAccountId: string;
  amount: number;
  currency: "CNY";
  status: WorkerWithdrawalStatus;
  requestNote: string | null;
  reviewNote: string | null;
  markedPaidNote: string | null;
  requestedAt: string;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  markedPaidAt: string | null;
  markedPaidByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateWorkerWithdrawalRequest {
  bankAccountId: string;
  amount: number;
  requestNote?: string | null;
}

export interface ReviewWorkerWithdrawalRequest {
  decision: WorkerWithdrawalReviewDecision;
  reviewNote?: string | null;
}

export interface MarkWorkerWithdrawalPaidRequest {
  markedPaidNote?: string | null;
}
