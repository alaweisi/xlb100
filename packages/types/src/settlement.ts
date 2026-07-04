import type { CityCode } from "./city.js";

export type SettlementBatchStatus = "prepared" | "confirmed" | "cancelled";
export type SettlementItemStatus = "prepared" | "confirmed" | "cancelled";

export interface SettlementBatch {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  itemCount: number;
  status: SettlementBatchStatus;
  preparedAt: string;
  confirmedAt: string | null;
  confirmedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementItem {
  settlementItemId: string;
  settlementBatchId: string;
  cityCode: CityCode;
  accrualId: string;
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
  status: SettlementItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementPreparedEventPayload {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  itemCount: number;
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  preparedAt: string;
}

export interface SettlementConfirmedEventPayload {
  settlementBatchId: string;
  cityCode: CityCode;
  currency: "CNY";
  itemCount: number;
  totalGrossAmount: number;
  totalPlatformFee: number;
  totalWorkerReceivable: number;
  confirmedAt: string;
  confirmedBy: string;
}

export type SettlementPayableStatus = "payable";

export interface SettlementPayable {
  settlementPayableId: string;
  cityCode: CityCode;
  settlementBatchId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  status: SettlementPayableStatus;
  markedAt: string;
  markedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementPayableEventPayload {
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  markedAt: string;
  markedBy: string;
}

export type SettlementPayableQueueStatus = "queued";

export interface SettlementPayableQueue {
  queueId: string;
  cityCode: CityCode;
  settlementPayableId: string;
  settlementBatchId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  status: SettlementPayableQueueStatus;
  enqueuedAt: string;
  enqueuedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementPayableQueuedEventPayload {
  queueId: string;
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  enqueuedAt: string;
  enqueuedBy: string;
}

export type WorkerReceivableStatementStatus = "created";

export interface WorkerReceivableStatement {
  statementId: string;
  cityCode: CityCode;
  queueId: string;
  settlementPayableId: string;
  settlementBatchId: string;
  workerId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  status: WorkerReceivableStatementStatus;
  generatedAt: string;
  generatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerReceivableStatementLine {
  lineId: string;
  statementId: string;
  cityCode: CityCode;
  settlementItemId: string;
  settlementBatchId: string;
  workerId: string;
  orderId: string;
  fulfillmentId: string;
  skuId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  createdAt: string;
}

export interface WorkerReceivableStatementCreatedEventPayload {
  statementId: string;
  queueId: string;
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  workerId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  generatedAt: string;
  generatedBy: string;
}

export type WorkerReceivableStatementReviewDecision = "approved" | "rejected";

export interface WorkerReceivableStatementReview {
  reviewId: string;
  cityCode: CityCode;
  statementId: string;
  queueId: string;
  settlementPayableId: string;
  settlementBatchId: string;
  workerId: string;
  decision: WorkerReceivableStatementReviewDecision;
  reviewNote: string | null;
  reviewedAt: string;
  reviewedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerReceivableStatementReviewedEventPayload {
  reviewId: string;
  statementId: string;
  queueId: string;
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  workerId: string;
  decision: WorkerReceivableStatementReviewDecision;
  reviewNote: string | null;
  reviewedAt: string;
  reviewedBy: string;
}

export type WorkerReceivableStatementExportFormat = "internal_v1";
export type WorkerReceivableStatementExportPayloadVersion = "v1";

export interface WorkerReceivableStatementExport {
  exportId: string;
  cityCode: CityCode;
  statementId: string;
  reviewId: string;
  queueId: string;
  settlementPayableId: string;
  settlementBatchId: string;
  workerId: string;
  exportFormat: WorkerReceivableStatementExportFormat;
  payloadVersion: WorkerReceivableStatementExportPayloadVersion;
  contentHash: string;
  exportedAt: string;
  exportedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface WorkerReceivableStatementExportedEventPayload {
  exportId: string;
  statementId: string;
  reviewId: string;
  queueId: string;
  payableId: string;
  batchId: string;
  cityCode: CityCode;
  workerId: string;
  exportFormat: WorkerReceivableStatementExportFormat;
  payloadVersion: WorkerReceivableStatementExportPayloadVersion;
  contentHash: string;
  exportedAt: string;
  exportedBy: string;
}

// ── Phase 8I: Audit Query Types ──

export interface StatementAuditQuery {
  cityCode?: CityCode;
  workerId?: string;
  statementId?: string;
  reviewDecision?: WorkerReceivableStatementReviewDecision;
  hasReview?: boolean;
  hasExport?: boolean;
  exportFormat?: WorkerReceivableStatementExportFormat;
  statementCreatedFrom?: string;
  statementCreatedTo?: string;
  reviewedFrom?: string;
  reviewedTo?: string;
  exportedFrom?: string;
  exportedTo?: string;
  limit?: number;
  cursor?: string;
}

export interface StatementAuditItem {
  statementId: string;
  cityCode: CityCode;
  workerId: string;
  queueId: string;
  settlementPayableId: string;
  settlementBatchId: string;
  currency: "CNY";
  grossAmount: number;
  platformFeeAmount: number;
  workerReceivableAmount: number;
  itemCount: number;
  status: WorkerReceivableStatementStatus;
  generatedAt: string;
  generatedBy: string;
  review: {
    reviewId: string;
    decision: WorkerReceivableStatementReviewDecision;
    reviewNote: string | null;
    reviewedAt: string;
    reviewedBy: string;
  } | null;
  export: {
    exportId: string;
    exportFormat: WorkerReceivableStatementExportFormat;
    payloadVersion: WorkerReceivableStatementExportPayloadVersion;
    contentHash: string;
    exportedAt: string;
    exportedBy: string;
    outboxEventId: string | null;
  } | null;
}

export interface StatementAuditListResponse {
  items: StatementAuditItem[];
  nextCursor: string | null;
}

export interface StatementAuditDetailResponse {
  statement: WorkerReceivableStatement;
  review: WorkerReceivableStatementReview | null;
  export: WorkerReceivableStatementExport | null;
  exportedOutboxEvent: {
    eventId: string;
    eventType: string;
    status: string;
    publishedAt: string | null;
  } | null;
}

export interface ExportAuditQuery {
  cityCode?: CityCode;
  workerId?: string;
  statementId?: string;
  exportFormat?: WorkerReceivableStatementExportFormat;
  contentHash?: string;
  exportedFrom?: string;
  exportedTo?: string;
  limit?: number;
  cursor?: string;
}

export interface ExportAuditItem {
  exportId: string;
  cityCode: CityCode;
  statementId: string;
  reviewId: string;
  workerId: string;
  exportFormat: WorkerReceivableStatementExportFormat;
  payloadVersion: WorkerReceivableStatementExportPayloadVersion;
  contentHash: string;
  exportedAt: string;
  exportedBy: string;
  outboxEventId: string | null;
}