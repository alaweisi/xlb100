import { randomBytes } from "node:crypto";

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export const generateSettlementBatchId = (): string => id("stb");
export const generateSettlementItemId = (): string => id("sti");
export const generateSettlementPayableId = (): string => id("spy");
export const generateSettlementPayableQueueId = (): string => id("spq");
export const generateWorkerReceivableStatementId = (): string => id("wrs");
export const generateWorkerReceivableStatementLineId = (): string => id("wrl");
export const generateWorkerReceivableStatementReviewId = (): string => id("wrr");
export const generateWorkerReceivableStatementExportId = (): string => id("wre");
