import type { ApiClient } from "./createApiClient.js";
import { createSettlementApi } from "./settlement.js";
import type {
  WorkerReceivableBalanceResponse,
  WorkerWithdrawalResponse,
} from "./worker.js";

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

export interface ListWorkerWithdrawalsQuery {
  cityCode?: string;
  workerId?: string;
  status?: WorkerWithdrawalResponse["status"];
  limit?: number;
}

function buildQuery(query: ListWorkerWithdrawalsQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
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
    settlement: createSettlementApi(client),
    getOrderTrace(orderId: string): Promise<AdminOrderTraceResponse> {
      return client.get<AdminOrderTraceResponse>(
        `/api/internal/admin/order-traces/${encodeURIComponent(orderId)}`,
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
