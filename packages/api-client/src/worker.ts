/** Phase 7A/7B worker accept + fulfillment lifecycle API */
import type { ApiClient } from "./createApiClient.js";
import type { AftersaleRepairOrderResponse } from "./aftersale.js";
import type { UploadFulfillmentEvidenceResponse, WorkerFulfillmentEvidenceResponse } from "./evidence.js";
import type { FulfillmentEvidenceType } from "@xlb/types";

export interface WorkerTaskPoolItemResponse {
  dispatchTaskId: string;
  cityCode: string;
  orderId: string;
  skuId: string;
  amount: number;
  streamName: string;
  status:
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
  createdAt: string;
}

export interface WorkerTaskAcceptanceResponse {
  acceptanceId: string;
  dispatchTaskId: string;
  cityCode: string;
  orderId: string;
  workerId: string;
  skuId: string;
  status: "accepted" | "cancelled";
  acceptedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface FulfillmentResponse {
  fulfillmentId: string;
  acceptanceId: string;
  dispatchTaskId: string;
  orderId: string;
  cityCode: string;
  workerId: string;
  skuId: string;
  status: "accepted" | "in_progress" | "completed" | "cancelled";
  startedAt?: string | null;
  completedAt?: string | null;
  completionNote?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerCertificationResponse {
  certificationId: string;
  workerId: string;
  cityCode: string;
  certType: string;
  certName: string;
  status: "pending" | "approved" | "rejected" | "expired";
  submittedAt: string;
  reviewedAt?: string | null;
  reviewerId?: string | null;
  rejectReason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerEligibilityResponse {
  workerId: string;
  cityCode: string;
  skuId: string;
  isEligible: boolean;
  reasons: string[];
}

export type AcceptTaskResponse = {
  ok: true;
  acceptance: WorkerTaskAcceptanceResponse;
  fulfillment: FulfillmentResponse;
  idempotent: boolean;
};

export type WorkerTaskPoolResponse = {
  ok: true;
  cityCode: string;
  tasks: WorkerTaskPoolItemResponse[];
};

export type FulfillmentListResponse = {
  ok: true;
  cityCode: string;
  fulfillments: FulfillmentResponse[];
};

export type FulfillmentDetailResponse = {
  ok: true;
  fulfillment: FulfillmentResponse;
};

export type FulfillmentLifecycleResponse = {
  ok: true;
  fulfillment: FulfillmentResponse;
  idempotent: boolean;
};

export type WorkerTaskMutationResponse = {
  ok: true;
  task: WorkerTaskPoolItemResponse;
};

export type SubmitWorkerCertificationInput = {
  certType: string;
  certName: string;
};

export type SubmitWorkerCertificationResponse = {
  ok: true;
  certification: WorkerCertificationResponse;
};

export type WorkerEligibilityApiResponse = {
  ok: true;
  eligibility: WorkerEligibilityResponse;
};

export type CompleteFulfillmentInput = {
  completionNote?: string;
};

export interface WorkerReceivableBalanceResponse {
  cityCode: string;
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

export interface WorkerBankAccountResponse {
  bankAccountId: string;
  cityCode: string;
  workerId: string;
  accountHolder: string;
  bankName: string;
  bankBranch: string | null;
  bankCardMasked: string;
  bankCardLast4: string;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
}

export interface WorkerWithdrawalResponse {
  withdrawalId: string;
  cityCode: string;
  workerId: string;
  bankAccountId: string;
  amount: number;
  currency: "CNY";
  status: "requested" | "approved" | "rejected" | "marked_paid" | "cancelled";
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

export interface CreateWorkerBankAccountBody {
  accountHolder: string;
  bankName: string;
  bankBranch?: string | null;
  bankCardNumber: string;
}

export interface CreateWorkerWithdrawalBody {
  bankAccountId: string;
  amount: number;
  requestNote?: string | null;
}

export function createWorkerApi(client: ApiClient) {
  return {
    getTaskPool(): Promise<WorkerTaskPoolResponse> {
      return client.get<WorkerTaskPoolResponse>("/api/worker/task-pool");
    },
    acceptTask(dispatchTaskId: string): Promise<AcceptTaskResponse> {
      return client.post<AcceptTaskResponse>(
        `/api/worker/tasks/${encodeURIComponent(dispatchTaskId)}/accept`,
        {},
      );
    },
    rejectTask(
      dispatchTaskId: string,
      reason = "worker rejected offer",
    ): Promise<WorkerTaskMutationResponse> {
      return client.post<WorkerTaskMutationResponse>(
        `/api/worker/tasks/${encodeURIComponent(dispatchTaskId)}/reject`,
        { reason },
      );
    },
    simulateTaskTimeout(dispatchTaskId: string): Promise<WorkerTaskMutationResponse> {
      return client.post<WorkerTaskMutationResponse>(
        `/api/worker/tasks/${encodeURIComponent(dispatchTaskId)}/simulate-timeout`,
        {},
      );
    },
    getMyFulfillments(): Promise<FulfillmentListResponse> {
      return client.get<FulfillmentListResponse>("/api/worker/fulfillments");
    },
    getFulfillment(fulfillmentId: string): Promise<FulfillmentDetailResponse> {
      return client.get<FulfillmentDetailResponse>(
        `/api/worker/fulfillments/${encodeURIComponent(fulfillmentId)}`,
      );
    },
    startFulfillment(fulfillmentId: string): Promise<FulfillmentLifecycleResponse> {
      return client.post<FulfillmentLifecycleResponse>(
        `/api/worker/fulfillments/${encodeURIComponent(fulfillmentId)}/start`,
        {},
      );
    },
    completeFulfillment(
      fulfillmentId: string,
      input: CompleteFulfillmentInput = {},
    ): Promise<FulfillmentLifecycleResponse> {
      return client.post<FulfillmentLifecycleResponse>(
        `/api/worker/fulfillments/${encodeURIComponent(fulfillmentId)}/complete`,
        input,
      );
    },
    getFulfillmentEvidence(fulfillmentId: string): Promise<WorkerFulfillmentEvidenceResponse> {
      return client.get<WorkerFulfillmentEvidenceResponse>(
        `/api/worker/fulfillments/${encodeURIComponent(fulfillmentId)}/evidence`,
      );
    },
    uploadFulfillmentEvidence(
      fulfillmentId: string,
      file: File,
      metadata: { evidenceType: FulfillmentEvidenceType; complaintId?: string; note?: string },
    ): Promise<UploadFulfillmentEvidenceResponse> {
      const query = new URLSearchParams({ evidenceType: metadata.evidenceType });
      if (metadata.complaintId) query.set("complaintId", metadata.complaintId);
      if (metadata.note) query.set("note", metadata.note);
      return client.postBinary<UploadFulfillmentEvidenceResponse>(
        `/api/worker/fulfillments/${encodeURIComponent(fulfillmentId)}/evidence?${query.toString()}`,
        file,
        { contentType: file.type, fileName: file.name },
      );
    },
    submitCertification(input: SubmitWorkerCertificationInput): Promise<SubmitWorkerCertificationResponse> {
      return client.post<SubmitWorkerCertificationResponse>("/api/worker/certifications", input);
    },
    getEligibility(skuId: string): Promise<WorkerEligibilityApiResponse> {
      return client.get<WorkerEligibilityApiResponse>(
        `/api/worker/eligibility?skuId=${encodeURIComponent(skuId)}`,
      );
    },
    getReceivableBalance(): Promise<{ ok: true; balance: WorkerReceivableBalanceResponse }> {
      return client.get<{ ok: true; balance: WorkerReceivableBalanceResponse }>(
        "/api/worker/finance/balance",
      );
    },
    createBankAccount(
      body: CreateWorkerBankAccountBody,
    ): Promise<{ ok: true; bankAccount: WorkerBankAccountResponse }> {
      return client.post<{ ok: true; bankAccount: WorkerBankAccountResponse }>(
        "/api/worker/bank-accounts",
        body,
      );
    },
    listBankAccounts(): Promise<{ ok: true; bankAccounts: WorkerBankAccountResponse[] }> {
      return client.get<{ ok: true; bankAccounts: WorkerBankAccountResponse[] }>(
        "/api/worker/bank-accounts",
      );
    },
    createWithdrawalRequest(
      body: CreateWorkerWithdrawalBody,
    ): Promise<{
      ok: true;
      withdrawal: WorkerWithdrawalResponse;
      balance: WorkerReceivableBalanceResponse;
    }> {
      return client.post<{
        ok: true;
        withdrawal: WorkerWithdrawalResponse;
        balance: WorkerReceivableBalanceResponse;
      }>("/api/worker/withdrawal-requests", body);
    },
    listWithdrawalRequests(): Promise<{ ok: true; withdrawals: WorkerWithdrawalResponse[] }> {
      return client.get<{ ok: true; withdrawals: WorkerWithdrawalResponse[] }>(
        "/api/worker/withdrawal-requests",
      );
    },
    listAftersaleRepairOrders(): Promise<{ ok: true; repairOrders: AftersaleRepairOrderResponse[] }> {
      return client.get<{ ok: true; repairOrders: AftersaleRepairOrderResponse[] }>("/api/worker/aftersale/repair-orders");
    },
    startAftersaleRepairOrder(repairOrderId: string): Promise<{ ok: true; repairOrder: AftersaleRepairOrderResponse }> {
      return client.post<{ ok: true; repairOrder: AftersaleRepairOrderResponse }>(`/api/worker/aftersale/repair-orders/${encodeURIComponent(repairOrderId)}/start`,{});
    },
    completeAftersaleRepairOrder(repairOrderId: string, serviceNote: string): Promise<{ ok: true; repairOrder: AftersaleRepairOrderResponse }> {
      return client.post<{ ok: true; repairOrder: AftersaleRepairOrderResponse }>(`/api/worker/aftersale/repair-orders/${encodeURIComponent(repairOrderId)}/complete`,{serviceNote});
    },
  };
}

export const workerApi = {
  create: createWorkerApi,
};
