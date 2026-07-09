/** Phase 7A/7B worker accept + fulfillment lifecycle API */
import type { ApiClient } from "./createApiClient.js";

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
    submitCertification(input: SubmitWorkerCertificationInput): Promise<SubmitWorkerCertificationResponse> {
      return client.post<SubmitWorkerCertificationResponse>("/api/worker/certifications", input);
    },
    getEligibility(skuId: string): Promise<WorkerEligibilityApiResponse> {
      return client.get<WorkerEligibilityApiResponse>(
        `/api/worker/eligibility?skuId=${encodeURIComponent(skuId)}`,
      );
    },
  };
}

export const workerApi = {
  create: createWorkerApi,
};
