/** Phase 7A/7B worker accept + fulfillment lifecycle API */
import type { ApiClient } from "./createApiClient.js";

export interface WorkerTaskPoolItem {
  dispatchTaskId: string;
  cityCode: string;
  orderId: string;
  skuId: string;
  amount: number;
  streamName: string;
  status: string;
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

export type AcceptTaskResponse = {
  ok: true;
  acceptance: WorkerTaskAcceptanceResponse;
  fulfillment: FulfillmentResponse;
  idempotent: boolean;
};

export interface WorkerTaskPoolResponse {
  ok: true;
  cityCode: string;
  tasks: WorkerTaskPoolItem[];
}

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
  };
}

export const workerApi = {
  create: createWorkerApi,
};
