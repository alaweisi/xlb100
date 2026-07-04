import type { ApiClient } from "./createApiClient.js";

export interface LedgerAccrualResponse {
  accrualId: string;
  cityCode: string;
  fulfillmentId: string;
  orderId: string;
  paymentOrderId: string;
  workerId: string;
  customerId: string;
  skuId: string;
  grossAmount: number;
  platformFee: number;
  workerReceivable: number;
  currency: "CNY";
  sourceEventId: string;
  status: "accrued" | "voided";
  createdAt: string;
}

export function createLedgerApi(client: ApiClient) {
  return {
    runLedgerOnce: () =>
      client.post<{
        ok: true;
        processed: number;
        accruals: LedgerAccrualResponse[];
      }>("/api/internal/ledger/run-once", {}),
    listLedgerAccruals: () =>
      client.get<{ ok: true; accruals: LedgerAccrualResponse[] }>(
        "/api/internal/ledger/accruals",
      ),
  };
}

export const ledgerApi = { create: createLedgerApi };
