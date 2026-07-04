import type { SettlementBatchStatus } from "@xlb/types";

export function canConfirmSettlement(status: SettlementBatchStatus): boolean {
  return status === "prepared";
}

export function assertSettlementConfirmable(status: SettlementBatchStatus): void {
  if (!canConfirmSettlement(status)) {
    throw new Error(`settlement batch status ${status} cannot be confirmed`);
  }
}

export function canMarkSettlementPayable(status: SettlementBatchStatus): boolean {
  return status === "confirmed";
}

export function assertSettlementPayableReady(status: SettlementBatchStatus): void {
  if (!canMarkSettlementPayable(status)) {
    throw new Error(`settlement batch status ${status} cannot be marked payable`);
  }
}

export function canEnqueueSettlementPayable(payableStatus: "payable"): boolean {
  return payableStatus === "payable";
}

export function assertSettlementPayableEnqueueable(payableStatus: "payable"): void {
  if (!canEnqueueSettlementPayable(payableStatus)) {
    throw new Error(`settlement payable status ${payableStatus} cannot be enqueued`);
  }
}

export function canGenerateWorkerReceivableStatements(queueStatus: "queued"): boolean {
  return queueStatus === "queued";
}

export function assertWorkerReceivableStatementGeneratable(queueStatus: "queued"): void {
  if (!canGenerateWorkerReceivableStatements(queueStatus)) {
    throw new Error(`settlement payable queue status ${queueStatus} cannot generate worker receivable statements`);
  }
}
