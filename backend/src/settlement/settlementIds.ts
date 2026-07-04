import { randomBytes } from "node:crypto";

function id(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${randomBytes(4).toString("hex")}`;
}

export const generateSettlementBatchId = (): string => id("stb");
export const generateSettlementItemId = (): string => id("sti");
export const generateSettlementPayableId = (): string => id("spy");
export const generateSettlementPayableQueueId = (): string => id("spq");
