import { createHash } from "node:crypto";
import type {
  WorkerReceivableStatementExportFormat,
  WorkerReceivableStatementExportPayloadVersion,
} from "@xlb/types";

export function computeWorkerReceivableStatementExportContentHash(input: {
  statementId: string;
  reviewId: string;
  exportFormat: WorkerReceivableStatementExportFormat;
  payloadVersion: WorkerReceivableStatementExportPayloadVersion;
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
}): string {
  const canonical = JSON.stringify({
    statementId: input.statementId,
    reviewId: input.reviewId,
    exportFormat: input.exportFormat,
    payloadVersion: input.payloadVersion,
    grossAmount: input.grossAmount,
    platformFeeAmount: input.platformFeeAmount,
    workerReceivableAmount: input.workerReceivableAmount,
    itemCount: input.itemCount,
  });
  return createHash("sha256").update(canonical).digest("hex");
}
