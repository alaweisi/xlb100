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
