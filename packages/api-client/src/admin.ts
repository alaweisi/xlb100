import type { ApiClient } from "./createApiClient.js";
import { createAdminSupportApi } from "./support.js";
import { createSettlementApi } from "./settlement.js";
import type {
  WorkerReceivableBalanceResponse,
  WorkerWithdrawalResponse,
} from "./worker.js";
import type {
  AftersaleComplaintDetailResponse,
  AftersaleComplaintResponse,
  AftersaleCompensationIntentResponse,
  AftersaleLiabilityDecisionResponse,
  AftersaleRepairOrderResponse,
  ComplaintPriorityResponse,
  ComplaintStatusResponse,
  OrderReverseResponse,
} from "./aftersale.js";
import type { OrderFulfillmentEvidenceResponse } from "./evidence.js";
import { createEnterpriseAdminApi } from "./enterprise.js";
import { createAdminReviewApi } from "./reviewReputation.js";
import { createAdminMarketingApi } from "./marketing.js";
import type {
  AdminOrderSummary,
  AdminSkuOperationsRow,
  CityConfigSnapshot,
  UpdateCityConfigRequest,
  WorkerCertification,
} from "@xlb/types";

export interface AdminOrderTrace {
  order: {
    orderId: string;
    cityCode: string;
    customerId: string;
    skuId: string;
    skuName: string;
    status: string;
    totalAmount: number;
    currency: string;
    createdAt: string;
  };
  pricing: {
    source: "legacy" | "public" | "enterprise" | "marketing";
    currency: string;
    grossAmountMinor: number | null;
    discountAmountMinor: number | null;
    netAmountMinor: number | null;
    marketingDecision: {
      decisionId: string;
      decisionRevision: number;
      ruleRevisionId: string;
      ruleContentHash: string;
      couponDefinitionId: string;
      grantId: string;
      reservationId: string;
      redemptionId: string;
      requestFingerprint: string;
      issuedAt: string;
      expiresAt: string;
      acceptedAt: string;
    } | null;
  } | null;
  payment: {
    paymentOrderId: string;
    status: string | null;
    amount: number;
    currency: string | null;
    provider: string | null;
    updatedAt: string | null;
  } | null;
  dispatch: {
    dispatchTaskId: string;
    status: string | null;
    customerMessage: string | null;
    updatedAt: string | null;
    timeline: {
      dispatchEventId: string;
      eventType: string;
      workerId: string | null;
      reason: string | null;
      createdAt: string;
    }[];
  } | null;
  fulfillment: {
    fulfillmentId: string;
    workerId: string | null;
    status: string | null;
    startedAt: string | null;
    completedAt: string | null;
    updatedAt: string | null;
  } | null;
  review: {
    reviewId: string;
    status: string | null;
    rating: number;
    comment: null;
    commentRestricted: true;
    createdAt: string | null;
  } | null;
  aftersale: {
    refundId: string;
    status: string | null;
    amount: number;
    currency: string | null;
    reason: string | null;
    requestedAt: string | null;
    approvedAt: string | null;
  } | null;
  phase17Aftersale: {
    reverseRequests: Array<{
      reverseRequestId: string; reverseType: string; status: string; reason: string;
      requestedScheduledAt: string | null; requestedTimeSlot: string | null;
      reviewNote: string | null; createdAt: string; appliedAt: string | null;
    }>;
    complaints: Array<{
      complaintId: string; category: string; priority: string; status: string;
      description: string; resolutionType: string | null; resolutionNote: string | null;
      submittedAt: string; resolvedAt: string | null; closedAt: string | null;
    }>;
    timeline: Array<{
      timelineEventId: string; eventType: string; actorType: string;
      actorId: string | null; content: string; createdAt: string;
    }>;
  };
}

export interface DispatchBoardRow {dispatchTaskId:string;orderId:string;skuId:string;status:string;attemptCount:number;lastReason:string|null;offer:null|{offerId:string;workerId:string;status:string;distanceKm:number|null;etaMinutes:number|null;rankScore:number|null;expiresAt:string|null;locationFreshness:string|null;externalProviderExecuted:boolean};}

export interface AdminOrderTraceResponse {
  ok: boolean;
  trace: AdminOrderTrace;
}

export interface ListWorkerWithdrawalsQuery {
  cityCode?: string;
  workerId?: string;
  status?: WorkerWithdrawalResponse["status"];
  limit?: number;
}

function buildQuery<T extends object>(query: T): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query as Record<string, unknown>)) {
    if (value !== undefined && value !== "") {
      params.set(key, String(value));
    }
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

/** Admin API modules; callers provide scoped admin/operator headers. */
export function createAdminApi(client: ApiClient) {
  return {
    ...createAdminSupportApi(client),
    settlement: createSettlementApi(client),
    enterprise: createEnterpriseAdminApi(client),
    review: createAdminReviewApi(client),
    marketing: createAdminMarketingApi(client),
    listOperationsOrders(): Promise<{ok:true;orders:AdminOrderSummary[]}>{return client.get("/api/internal/operations/orders");},
    listOperationsSkus(): Promise<{ok:true;skus:AdminSkuOperationsRow[]}>{return client.get("/api/internal/operations/skus");},
    setOperationsSkuEnabled(skuId:string,enabled:boolean):Promise<{ok:true;sku:{skuId:string;isEnabled:boolean}}>{return client.post(`/api/internal/operations/skus/${encodeURIComponent(skuId)}/status`,{enabled});},
    listWorkerCertifications(status?:WorkerCertification["status"]):Promise<{ok:true;certifications:WorkerCertification[]}>{return client.get(`/api/admin/certifications${status?`?status=${encodeURIComponent(status)}`:""}`);},
    approveWorkerCertification(certificationId:string):Promise<{ok:true;certification:WorkerCertification}>{return client.post(`/api/admin/certifications/${encodeURIComponent(certificationId)}/approve`,{});},
    rejectWorkerCertification(certificationId:string,reason:string):Promise<{ok:true;certification:WorkerCertification}>{return client.post(`/api/admin/certifications/${encodeURIComponent(certificationId)}/reject`,{reason});},
    listDispatchBoard():Promise<{ok:true;rows:DispatchBoardRow[]}>{return client.get("/api/internal/dispatch/board");},
    updateCityConfig(body: UpdateCityConfigRequest): Promise<{ ok: true; config: CityConfigSnapshot }> {
      return client.post("/api/admin/city-config/update", body);
    },
    runDispatchMatch(dispatchTaskId?:string){return client.post<{ok:true;processed:number}>("/api/internal/dispatch/match-once",dispatchTaskId?{dispatchTaskId}:{});},
    runDispatchTimeout(){return client.post<{ok:true;processed:number}>("/api/internal/dispatch/timeout-once",{timeoutMinutes:15});},
    getOrderTrace(orderId: string): Promise<AdminOrderTraceResponse> {
      return client.get<AdminOrderTraceResponse>(
        `/api/internal/admin/order-traces/${encodeURIComponent(orderId)}`,
      );
    },
    listOrderReverseRequests(query: { status?: string; reverseType?: string } = {}) {
      return client.get<{ ok: true; reverseRequests: OrderReverseResponse[] }>(
        `/api/internal/aftersale/reverse-requests${buildQuery(query)}`,
      );
    },
    reviewOrderReverseRequest(reverseRequestId: string, body: { decision: "approved" | "rejected"; reviewNote?: string }) {
      return client.post<{ ok: true; reverseRequest: OrderReverseResponse; idempotent: boolean }>(
        `/api/internal/aftersale/reverse-requests/${encodeURIComponent(reverseRequestId)}/review`,body,
      );
    },
    applyOrderReverseRequest(reverseRequestId: string) {
      return client.post<{ ok: true; reverseRequest: OrderReverseResponse; idempotent: boolean }>(
        `/api/internal/aftersale/reverse-requests/${encodeURIComponent(reverseRequestId)}/apply`,{},
      );
    },
    listAftersaleComplaints(query: { orderId?: string; status?: ComplaintStatusResponse } = {}) {
      return client.get<{ ok: true; complaints: AftersaleComplaintResponse[] }>(
        `/api/internal/aftersale/complaints${buildQuery(query)}`,
      );
    },
    getAftersaleComplaint(complaintId: string) {
      return client.get<{ ok: true; detail: AftersaleComplaintDetailResponse }>(
        `/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}`,
      );
    },
    triageAftersaleComplaint(complaintId: string, body: { status: "triaged" | "in_progress" | "waiting_customer"; priority?: ComplaintPriorityResponse; assignedAdminId?: string; note?: string }) {
      return client.post<{ ok: true; complaint: AftersaleComplaintResponse }>(
        `/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/triage`,body,
      );
    },
    resolveAftersaleComplaint(complaintId: string, body: { resolutionType: AftersaleComplaintResponse["resolutionType"] extends infer T ? Exclude<T, null> : never; resolutionNote: string }) {
      return client.post<{ ok: true; complaint: AftersaleComplaintResponse }>(
        `/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/resolve`,body,
      );
    },
    closeAftersaleComplaint(complaintId: string) {
      return client.post<{ ok: true; complaint: AftersaleComplaintResponse }>(`/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/close`,{});
    },
    addAftersaleComplaintNote(complaintId: string, content: string) {
      return client.post<{ ok: true }>(`/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/notes`,{content});
    },
    createAftersaleRepairOrder(complaintId: string, body: { workerId?: string; reason: string }) {
      return client.post<{ ok: true; repairOrder: AftersaleRepairOrderResponse }>(`/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/repair-orders`,body);
    },
    decideAftersaleLiability(complaintId: string, body: { liableParty: AftersaleLiabilityDecisionResponse["liableParty"]; workerLiabilityPercent: number; platformLiabilityPercent: number; customerLiabilityPercent: number; reason: string }) {
      return client.post<{ ok: true; liabilityDecision: AftersaleLiabilityDecisionResponse; idempotent: boolean }>(`/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/liability-decisions`,body);
    },
    proposeAftersaleCompensation(complaintId: string, body: { intentType: AftersaleCompensationIntentResponse["intentType"]; requestedAmount?: number; reason: string }) {
      return client.post<{ ok: true; compensationIntent: AftersaleCompensationIntentResponse }>(`/api/internal/aftersale/complaints/${encodeURIComponent(complaintId)}/compensation-intents`,body);
    },
    reviewAftersaleCompensation(compensationIntentId: string, body: { decision: "approved" | "rejected"; approvedAmount?: number; decisionNote?: string }) {
      return client.post<{ ok: true; compensationIntent: AftersaleCompensationIntentResponse; idempotent: boolean }>(`/api/internal/aftersale/compensation-intents/${encodeURIComponent(compensationIntentId)}/review`,body);
    },
    getOrderFulfillmentEvidence(orderId: string): Promise<OrderFulfillmentEvidenceResponse> {
      return client.get<OrderFulfillmentEvidenceResponse>(
        `/api/internal/orders/${encodeURIComponent(orderId)}/fulfillment-evidence`,
      );
    },
    listWorkerWithdrawals(
      query: ListWorkerWithdrawalsQuery = {},
    ): Promise<{ ok: true; withdrawals: WorkerWithdrawalResponse[] }> {
      return client.get<{ ok: true; withdrawals: WorkerWithdrawalResponse[] }>(
        `/api/internal/worker-withdrawals${buildQuery(query)}`,
      );
    },
    reviewWorkerWithdrawal(
      withdrawalId: string,
      body: { decision: "approved" | "rejected"; reviewNote?: string | null },
    ): Promise<{
      ok: true;
      withdrawal: WorkerWithdrawalResponse;
      balance: WorkerReceivableBalanceResponse;
      idempotent: boolean;
    }> {
      return client.post<{
        ok: true;
        withdrawal: WorkerWithdrawalResponse;
        balance: WorkerReceivableBalanceResponse;
        idempotent: boolean;
      }>(`/api/internal/worker-withdrawals/${encodeURIComponent(withdrawalId)}/review`, body);
    },
    markWorkerWithdrawalPaid(
      withdrawalId: string,
      body: { markedPaidNote?: string | null } = {},
    ): Promise<{
      ok: true;
      withdrawal: WorkerWithdrawalResponse;
      balance: WorkerReceivableBalanceResponse;
      idempotent: boolean;
    }> {
      return client.post<{
        ok: true;
        withdrawal: WorkerWithdrawalResponse;
        balance: WorkerReceivableBalanceResponse;
        idempotent: boolean;
      }>(`/api/internal/worker-withdrawals/${encodeURIComponent(withdrawalId)}/mark-paid`, body);
    },
  };
}

export const adminApi = { create: createAdminApi };
