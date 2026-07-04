import type { SettlementBatchStatus } from "@xlb/types";

export function canConfirmSettlement(status: SettlementBatchStatus): boolean {
  return status === "prepared";
}

export function assertSettlementConfirmable(status: SettlementBatchStatus): void {
  if (!canConfirmSettlement(status)) {
    throw new Error(`settlement batch status ${status} cannot be confirmed`);
  }
}
