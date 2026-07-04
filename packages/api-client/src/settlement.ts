import type { ApiClient } from "./createApiClient.js";

export interface SettlementBatchResponse {
  settlementBatchId: string; cityCode: string; currency: "CNY";
  totalGrossAmount: number; totalPlatformFee: number;
  totalWorkerReceivable: number; itemCount: number;
  status: "prepared" | "confirmed" | "cancelled"; preparedAt: string;
  confirmedAt: string | null; confirmedBy: string | null;
  createdAt: string; updatedAt: string;
}

export interface SettlementItemResponse {
  settlementItemId: string; settlementBatchId: string; cityCode: string;
  accrualId: string; fulfillmentId: string; orderId: string;
  paymentOrderId: string; workerId: string; customerId: string; skuId: string;
  grossAmount: number; platformFee: number; workerReceivable: number;
  currency: "CNY"; status: "prepared" | "confirmed" | "cancelled";
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
    confirmSettlementBatch: (batchId: string) =>
      client.post<{ ok: true; batch: SettlementBatchResponse; idempotent: boolean }>(
        `/api/internal/settlement/batches/${encodeURIComponent(batchId)}/confirm`,
        {},
      ),
    // ── Phase 8I: Audit Query ──
    listStatementAudit: (query?: Record<string, string>) => {
      const qs = query ? "?" + new URLSearchParams(query).toString() : "";
      return client.get<{ ok: true; items: unknown[]; nextCursor: string | null }>(
        `/api/internal/settlement/worker-statement-audit${qs}`,
      );
    },
    getStatementAuditDetail: (statementId: string) =>
      client.get<{
        ok: true;
        statement: unknown;
        review: unknown | null;
        export: unknown | null;
        exportedOutboxEvent: unknown | null;
      }>(
        `/api/internal/settlement/worker-statement-audit/${encodeURIComponent(statementId)}`,
      ),
    listExportAudit: (query?: Record<string, string>) => {
      const qs = query ? "?" + new URLSearchParams(query).toString() : "";
      return client.get<{ ok: true; items: unknown[]; nextCursor: string | null }>(
        `/api/internal/settlement/worker-statement-export-audit${qs}`,
      );
    },
    // ── Phase 8J: Review Summary ──
    getReviewSummary: (query?: Record<string, string>) => {
      const qs = query ? "?" + new URLSearchParams(query).toString() : "";
      return client.get<{
        ok: true;
        cityCode: string; dateFrom: string | null; dateTo: string | null;
        overall: Record<string, number>; groups: unknown[] | null;
      }>(`/api/internal/settlement/worker-statement-review-summary${qs}`);
    },
  };
}

export const settlementApi = { create: createSettlementApi };