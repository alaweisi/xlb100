import type { ApiClient } from "./createApiClient.js";

export interface SettlementBatchResponse {
  settlementBatchId: string; cityCode: string; currency: "CNY";
  totalGrossAmount: number; totalPlatformFee: number;
  totalWorkerReceivable: number; itemCount: number;
  status: "prepared" | "cancelled"; preparedAt: string;
  createdAt: string; updatedAt: string;
}

export interface SettlementItemResponse {
  settlementItemId: string; settlementBatchId: string; cityCode: string;
  accrualId: string; fulfillmentId: string; orderId: string;
  paymentOrderId: string; workerId: string; customerId: string; skuId: string;
  grossAmount: number; platformFee: number; workerReceivable: number;
  currency: "CNY"; status: "prepared" | "cancelled";
  createdAt: string; updatedAt: string;
}

export function createSettlementApi(client: ApiClient) {
  return {
    prepareSettlementOnce: () =>
      client.post<{ ok: true; processed: number; batch: SettlementBatchResponse | null }>(
        "/api/internal/settlement/prepare-once",
        {},
      ),
    listSettlementBatches: () =>
      client.get<{ ok: true; batches: SettlementBatchResponse[] }>(
        "/api/internal/settlement/batches",
      ),
    listSettlementBatchItems: (batchId: string) =>
      client.get<{ ok: true; items: SettlementItemResponse[] }>(
        `/api/internal/settlement/batches/${encodeURIComponent(batchId)}/items`,
      ),
  };
}

export const settlementApi = { create: createSettlementApi };
