import type {
  WorkerReceivableStatementExportFormat,
  WorkerReceivableStatementExportPayloadVersion,
} from "@xlb/types";
import { stableHash } from "@shared/deterministic/stableHash.js";

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
  return stableHash({
    statementId: input.statementId,
    reviewId: input.reviewId,
    exportFormat: input.exportFormat,
    payloadVersion: input.payloadVersion,
    grossAmount: input.grossAmount,
    platformFeeAmount: input.platformFeeAmount,
    workerReceivableAmount: input.workerReceivableAmount,
    itemCount: input.itemCount,
  });
}
