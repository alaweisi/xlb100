import type { ApiClient } from "./createApiClient.js";
import { createSettlementApi } from "./settlement.js";

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
    updatedAt: string | null;
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
    comment: string;
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
}

export interface AdminOrderTraceResponse {
  ok: boolean;
  trace: AdminOrderTrace;
}

/** Admin API modules; callers provide scoped admin/operator headers. */
export function createAdminApi(client: ApiClient) {
  return {
    settlement: createSettlementApi(client),
    getOrderTrace(orderId: string): Promise<AdminOrderTraceResponse> {
      return client.get<AdminOrderTraceResponse>(
        `/api/internal/admin/order-traces/${encodeURIComponent(orderId)}`,
      );
    },
  };
}

export const adminApi = { create: createAdminApi };
